import { createHash } from 'node:crypto'

/**
 * Decision rounds on a deal: one per (deal, SPV group, attempt). Table
 * deal_rounds (ctoroundtable-hq migration 032). All round SQL lives here.
 *
 * A round is created as a draft (`ctr deals publish`, POST /api/admin/deals/:slug/rounds)
 * with a SNAPSHOT of what it is about: the proposal and the current version of
 * each named document, hashed together into bundle_sha256, which every ballot
 * attests to. The rules are set here, never by the caller: model A+, 48 hours
 * flat, 2/3 of yes + no, live counts to members and named ballots to the
 * committee only (decision 2026-10-22 on the vote model, project ctori-4).
 */

export const ROUND_RULES = {
  threshold: '2/3',
  base: 'yes+no',
  excluded: ['blank', 'none'],
  weighting: 'person',
  window_h: 48,
  ballot: 'choices_board_only',
  mandate: null,
} as const

const PROPOSAL_KEYS = ['amount', 'currency', 'instrument', 'cap', 'termsSummary']

export interface Proposal {
  amount: number
  currency: string
  instrument: string
  cap: number | null
  termsSummary: string | null
}

/** Validate what the SPV is asked to approve. 400 on anything off. */
export function cleanProposal(value: unknown): Proposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createError({ statusCode: 400, message: 'proposal must be an object' })
  }
  const p = value as Record<string, unknown>
  const extra = Object.keys(p).filter((k) => !PROPOSAL_KEYS.includes(k))
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown proposal keys: ${extra.join(', ')}` })
  if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) {
    throw createError({ statusCode: 400, message: 'proposal.amount must be a positive number' })
  }
  if (typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency)) {
    throw createError({ statusCode: 400, message: 'proposal.currency must be a three-letter code (NOK)' })
  }
  if (typeof p.instrument !== 'string' || !p.instrument.trim() || p.instrument.length > 80) {
    throw createError({ statusCode: 400, message: 'proposal.instrument is required (at most 80 characters)' })
  }
  if (p.cap !== undefined && p.cap !== null && (typeof p.cap !== 'number' || !Number.isFinite(p.cap) || p.cap <= 0)) {
    throw createError({ statusCode: 400, message: 'proposal.cap must be a positive number or null' })
  }
  if (p.termsSummary !== undefined && p.termsSummary !== null) {
    if (typeof p.termsSummary !== 'string' || p.termsSummary.length > 2000) {
      throw createError({ statusCode: 400, message: 'proposal.termsSummary is at most 2000 characters' })
    }
  }
  return {
    amount: p.amount,
    currency: p.currency,
    instrument: p.instrument.trim(),
    cap: (p.cap as number | null | undefined) ?? null,
    termsSummary: typeof p.termsSummary === 'string' && p.termsSummary.trim() ? p.termsSummary.trim() : null,
  }
}

/** JSON with sorted keys, so the same content always hashes the same. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export interface RoundDocument {
  key: string
  title: string
  version: number
  sha256: string
}

/** sha256 over the documents (key order) and the proposal: what a ballot attests to. */
export function bundleSha256(documents: RoundDocument[], proposal: Proposal): string {
  const docs = [...documents]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((d) => ({ key: d.key, version: d.version, sha256: d.sha256 }))
  return createHash('sha256')
    .update(canonicalJson({ documents: docs, proposal }))
    .digest('hex')
}

/** The round object of the admin API (memory votes/admin-api.md). Add the tally with withTally(). */
export function roundObject(r: any) {
  const rules = r.rules ?? {}
  return {
    id: r.id,
    deal: { slug: r.deal_slug, name: r.deal_name },
    group: r.group_slug,
    kind: r.kind,
    status: r.status,
    source: r.source,
    rules: {
      threshold: rules.threshold ?? null,
      base: rules.base ?? null,
      excluded: rules.excluded ?? [],
      weighting: rules.weighting ?? null,
      windowH: rules.window_h ?? null,
      ballot: rules.ballot ?? null,
      mandate: rules.mandate ?? null,
    },
    proposal: r.proposal,
    documents: r.documents,
    bundleSha256: r.bundle_sha256,
    openedAt: r.opened_at,
    closesAt: r.closes_at,
    closedAt: r.closed_at,
    cancelReason: r.cancel_reason,
    result: r.result,
    tally: null as Tally | null,
    protocol: r.result_sha256 ? { sha256: r.result_sha256 } : null,
  }
}

export async function loadRound(roundId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(roundId)) return null
  const sql = useDatabase()
  const rows = await sql`
    SELECT r.*, pd.slug AS deal_slug, o.name AS deal_name, ng.slug AS group_slug, ng.name AS group_name
    FROM deal_rounds r
    JOIN pipeline_deals pd ON pd.id = r.deal_id
    JOIN organizations o ON o.id = pd.organization_id
    JOIN network_groups ng ON ng.id = r.group_id
    WHERE r.id = ${roundId}
  `
  return (rows[0] as any) ?? null
}

/**
 * A draft round on a deal for one SPV group. `documents` are keys of the deal's
 * CURRENT document versions. 409 if the deal already has a draft or open round
 * for that group (the 032 unique index is the backstop).
 */
export async function createDraftRound(
  dealId: string,
  input: { group: unknown; proposal: unknown; documents: unknown },
): Promise<ReturnType<typeof roundObject>> {
  if (typeof input.group !== 'string' || !input.group) {
    throw createError({ statusCode: 400, message: 'group is required (invest-N)' })
  }
  const proposal = cleanProposal(input.proposal)
  if (
    !Array.isArray(input.documents) ||
    input.documents.length === 0 ||
    input.documents.some((k) => typeof k !== 'string')
  ) {
    throw createError({ statusCode: 400, message: 'documents must be a non-empty list of document keys' })
  }
  const keys = [...new Set(input.documents as string[])]

  const sql = useDatabase()
  const groups = await sql`SELECT id, invest_phase FROM network_groups WHERE slug = ${input.group}`
  const group: any = groups[0]
  if (!group?.invest_phase) {
    throw createError({ statusCode: 400, message: `${input.group} is not an SPV group` })
  }
  if (group.invest_phase === 'completed') {
    throw createError({ statusCode: 400, message: `${input.group} is completed and makes no new investments` })
  }

  const docRows = await sql`
    SELECT DISTINCT ON (key) key, title, version, sha256
    FROM deal_documents
    WHERE deal_id = ${dealId} AND key = ANY(${keys})
    ORDER BY key, version DESC
  `
  const documents: RoundDocument[] = (docRows as any[]).map((d) => ({
    key: d.key,
    title: d.title,
    version: d.version,
    sha256: d.sha256,
  }))
  const missing = keys.filter((k) => !documents.some((d) => d.key === k))
  if (missing.length) {
    throw createError({ statusCode: 400, message: `No document uploaded for: ${missing.join(', ')}` })
  }

  const live = await sql`
    SELECT id, status FROM deal_rounds
    WHERE deal_id = ${dealId} AND group_id = ${group.id} AND status IN ('draft', 'open')
  `
  if (live.length) {
    throw createError({
      statusCode: 409,
      message: `The deal already has a ${(live[0] as any).status} round for ${input.group} (${(live[0] as any).id})`,
    })
  }

  let inserted: any[]
  try {
    inserted = (await sql`
      INSERT INTO deal_rounds (deal_id, group_id, kind, status, source, rules, proposal, documents, bundle_sha256)
      VALUES (${dealId}, ${group.id}, 'vote', 'draft', 'portal', ${JSON.stringify(ROUND_RULES)}::jsonb,
              ${JSON.stringify(proposal)}::jsonb, ${JSON.stringify(documents)}::jsonb,
              ${bundleSha256(documents, proposal)})
      RETURNING id
    `) as any[]
  } catch (err: any) {
    if (err?.code === '23505') {
      throw createError({ statusCode: 409, message: `The deal already has a draft or open round for ${input.group}` })
    }
    throw err
  }
  return roundObject(await loadRound(inserted[0].id))
}

// --- The vote: roster, ballots, tally, close (V7) ------------------------------------

export interface RosterEntry {
  person_id: string
  name: string
  email: string | null
  default_vote: 'blank' | null
  conflict: boolean
}

export type Choice = 'yes' | 'no' | 'blank'
export const CHOICES: Choice[] = ['yes', 'no', 'blank']

export interface Tally {
  eligible: number
  yes: number
  no: number
  /** cast blank */
  blank: number
  /** no ballot, standing default 'blank' applied */
  defaultBlank: number
  notVoted: number
  /** roster members whose only ballots came after closesAt (stored, never counted) */
  late: number
  /** cast a ballot on time, any choice, over eligible */
  turnout: number
}

interface CountedBallot {
  person_id: string
  choice: string
  method: string
  cast_at: string
  registered_by: string | null
}

/** The roster of an SPV group right now: active members, primary email, standing
 *  default, and each member's declared §9 conflict on this deal (deal_conflicts). */
async function freezeRoster(groupId: string, dealId: string): Promise<RosterEntry[]> {
  const sql = useDatabase()
  const conflicted = await conflictedPersonIds(dealId)
  const rows = await sql`
    SELECT p.id, p.name, m.default_vote,
           (SELECT ci.value FROM contact_infos ci
            WHERE ci.person_id = p.id AND ci.type = 'email'
            ORDER BY ci.is_primary DESC LIMIT 1) AS email
    FROM memberships m
    JOIN persons p ON p.id = m.person_id
    WHERE m.group_id = ${groupId} AND p.status = 'active'
    ORDER BY p.name
  `
  return (rows as any[]).map((r) => ({
    person_id: r.id,
    name: r.name,
    email: r.email,
    default_vote: r.default_vote === 'blank' ? 'blank' : null,
    conflict: conflicted.has(r.id),
  }))
}

/** On-time ballots that count (deal_ballots_current) and who only voted late. */
async function loadBallots(roundId: string) {
  const sql = useDatabase()
  const [current, late] = await Promise.all([
    sql`
      SELECT person_id, choice, method, cast_at, registered_by
      FROM deal_ballots_current WHERE round_id = ${roundId}
    `,
    sql`
      SELECT b.person_id, MAX(b.cast_at) AS cast_at
      FROM deal_ballots b JOIN deal_rounds r ON r.id = b.round_id
      WHERE b.round_id = ${roundId} AND r.closes_at IS NOT NULL AND b.cast_at > r.closes_at
      GROUP BY b.person_id
    `,
  ])
  return { current: current as CountedBallot[], late: late as { person_id: string; cast_at: string }[] }
}

/** Count a round against its frozen roster. Only roster members count. */
export function countRound(roster: RosterEntry[], current: CountedBallot[], late: { person_id: string }[]) {
  const byPerson = new Map(current.map((b) => [b.person_id, b]))
  const lateSet = new Set(late.map((l) => l.person_id))
  const t: Tally = {
    eligible: roster.length,
    yes: 0,
    no: 0,
    blank: 0,
    defaultBlank: 0,
    notVoted: 0,
    late: 0,
    turnout: 0,
  }
  const rows = roster.map((m) => {
    const b = byPerson.get(m.person_id)
    let counted: 'yes' | 'no' | 'blank' | 'default_blank' | 'none'
    if (b && (b.choice === 'yes' || b.choice === 'no' || b.choice === 'blank')) counted = b.choice
    else if (m.default_vote === 'blank') counted = 'default_blank'
    else counted = 'none'
    if (counted === 'yes') t.yes++
    else if (counted === 'no') t.no++
    else if (counted === 'blank') t.blank++
    else if (counted === 'default_blank') t.defaultBlank++
    else t.notVoted++
    const isLate = !b && lateSet.has(m.person_id)
    if (isLate) t.late++
    return { member: m, ballot: b ?? null, counted, late: isLate }
  })
  t.turnout = t.eligible ? (t.yes + t.no + t.blank) / t.eligible : 0
  return { tally: t, rows }
}

/** 2/3 of yes + no; nobody voting yes or no is no_quorum. */
export function resultOf(t: Tally): 'passed' | 'failed' | 'no_quorum' {
  const base = t.yes + t.no
  if (base === 0) return 'no_quorum'
  return 3 * t.yes >= 2 * base ? 'passed' : 'failed'
}

/** The live tally of an open round, or the frozen one of a closed round. Null for drafts and backfills. */
export async function tallyOf(r: any): Promise<Tally | null> {
  if (r.status === 'closed' && r.result_snapshot?.tally) return r.result_snapshot.tally
  if (!Array.isArray(r.roster)) return null
  const { current, late } = await loadBallots(r.id)
  return countRound(r.roster, current, late).tally
}

export async function withTally(r: any) {
  const o = roundObject(r)
  o.tally = await tallyOf(r)
  return o
}

/**
 * Open a draft: freeze the roster, start the 48 hours, log round_opened. The
 * deal-rounds job then sends the notices (POST /api/admin/rounds/:id/notify).
 */
export async function openRound(roundId: string, byPersonId: string) {
  const r = await loadRound(roundId)
  if (!r) throw createError({ statusCode: 404, message: 'Round not found' })
  if (r.status !== 'draft') throw createError({ statusCode: 409, message: `Round is ${r.status}, not draft` })
  const roster = await freezeRoster(r.group_id, r.deal_id)
  if (roster.length === 0) throw createError({ statusCode: 400, message: `${r.group_slug} has no active members` })
  const windowH = Number(r.rules?.window_h ?? 48)
  const sql = useDatabase()
  const [updated] = await sql.transaction([
    sql`
      UPDATE deal_rounds
      SET status = 'open', roster = ${JSON.stringify(roster)}::jsonb, opened_at = NOW(),
          closes_at = NOW() + make_interval(hours => ${windowH}::int), opened_by = ${byPersonId}
      WHERE id = ${roundId} AND status = 'draft'
      RETURNING id
    `,
    sql`
      INSERT INTO deal_events (deal_id, occurred_at, kind, body, source_kind, created_by)
      SELECT ${r.deal_id}, NOW(), 'round_opened',
             ${`Vote opened in the portal for ${r.group_slug}: ${roster.length} members, ${windowH} hours`},
             'manual', 'portal'
      WHERE EXISTS (SELECT 1 FROM deal_rounds WHERE id = ${roundId} AND status = 'open' AND opened_by = ${byPersonId})
    `,
  ])
  if ((updated as any[]).length === 0)
    throw createError({ statusCode: 409, message: 'Round was opened or changed meanwhile' })
  return withTally(await loadRound(roundId))
}

export async function cancelRound(roundId: string, reason: unknown, byPersonId: string) {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 300) {
    throw createError({ statusCode: 400, message: 'reason is required (at most 300 characters)' })
  }
  const sql = useDatabase()
  const rows = await sql`
    UPDATE deal_rounds SET status = 'cancelled', cancel_reason = ${reason.trim()}, closed_by = ${byPersonId}
    WHERE id = ${roundId} AND status IN ('draft', 'open')
    RETURNING id
  `
  if (rows.length === 0) {
    const r = await loadRound(roundId)
    if (!r) throw createError({ statusCode: 404, message: 'Round not found' })
    throw createError({ statusCode: 409, message: `Round is ${r.status}` })
  }
  return withTally(await loadRound(roundId))
}

function cleanChoice(value: unknown): Choice {
  if (!CHOICES.includes(value as Choice))
    throw createError({ statusCode: 400, message: 'choice must be yes, no or blank' })
  return value as Choice
}

/**
 * A member votes in the portal. The page sends the bundle hash it showed; if
 * the round's material is no longer that, the ballot is refused rather than
 * attested to something the member did not see.
 */
export async function castPortalBallot(
  personId: string,
  roundId: string,
  input: { choice: unknown; attested: unknown; ip: string | null; userAgent: string | null },
) {
  const choice = cleanChoice(input.choice)
  const r = await loadRound(roundId)
  if (!r) throw createError({ statusCode: 404, message: 'Round not found' })
  if (r.status !== 'open' || new Date(r.closes_at).getTime() <= Date.now()) {
    throw createError({ statusCode: 409, message: 'The vote is closed' })
  }
  const member = (r.roster as RosterEntry[]).find((m) => m.person_id === personId)
  if (!member) throw createError({ statusCode: 403, message: 'You are not on the roster for this vote' })
  if (member.conflict && choice !== 'blank') {
    throw createError({
      statusCode: 400,
      message: 'You are marked as conflicted on this company and can only vote blank',
    })
  }
  if (input.attested !== r.bundle_sha256) {
    throw createError({
      statusCode: 409,
      message: 'The material changed after you opened the page. Reload and vote again.',
    })
  }
  const sql = useDatabase()
  await sql.transaction([
    sql`
      INSERT INTO deal_ballots (round_id, person_id, choice, attested_sha256, method, auth, cast_at, ip, user_agent)
      VALUES (${roundId}, ${personId}, ${choice}, ${r.bundle_sha256}, 'portal', 'session', NOW(),
              ${input.ip}::inet, ${input.userAgent?.slice(0, 500) ?? null})
    `,
    sql`
      INSERT INTO deal_events (deal_id, occurred_at, kind, body, source_kind, created_by)
      VALUES (${r.deal_id}, NOW(), 'ballot', 'A ballot was cast in the portal', 'manual', 'portal')
    `,
  ])
}

/**
 * A ballot that came by mail, or one registered on a member's behalf, through
 * the admin API. Only while the round is open: a closed round's result is
 * frozen. A castAt after closesAt is stored and marked late. The same Gmail
 * message twice is one ballot (the retry gets the first one back).
 */
export async function registerBallot(roundId: string, body: Record<string, unknown>, registeredBy: string) {
  const KEYS = ['person', 'choice', 'method', 'castAt', 'sourceRef', 'auth', 'reason', 'note']
  const extra = Object.keys(body).filter((k) => !KEYS.includes(k))
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
  const choice = cleanChoice(body.choice)
  const method = body.method
  if (method !== 'email' && method !== 'on_behalf')
    throw createError({ statusCode: 400, message: 'method must be email or on_behalf' })
  const castAt = body.castAt === undefined && method === 'on_behalf' ? new Date().toISOString() : body.castAt
  if (typeof castAt !== 'string' || Number.isNaN(Date.parse(castAt))) {
    throw createError({ statusCode: 400, message: 'castAt must be an ISO timestamp (for email: the Date header)' })
  }
  if (Date.parse(castAt) > Date.now() + 5 * 60_000)
    throw createError({ statusCode: 400, message: 'castAt is in the future' })
  const sourceRef =
    typeof body.sourceRef === 'string' && body.sourceRef.trim() ? body.sourceRef.trim().slice(0, 200) : null
  if (method === 'email' && !sourceRef)
    throw createError({ statusCode: 400, message: 'sourceRef (the Gmail message id) is required for email' })
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
  if (reason && reason.length > 300) throw createError({ statusCode: 400, message: 'reason is at most 300 characters' })
  if (method === 'on_behalf' && !reason)
    throw createError({ statusCode: 400, message: 'reason is required for on_behalf' })
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null
  const auth = typeof body.auth === 'string' ? body.auth.slice(0, 200) : null

  const r = await loadRound(roundId)
  if (!r) throw createError({ statusCode: 404, message: 'Round not found' })
  if (r.status !== 'open')
    throw createError({ statusCode: 409, message: `Round is ${r.status}; ballots are recorded only while it is open` })

  const roster = r.roster as RosterEntry[]
  const who = typeof body.person === 'string' ? body.person.trim() : ''
  let member: RosterEntry | undefined
  if (/^[0-9a-f-]{36}$/i.test(who)) member = roster.find((m) => m.person_id === who)
  else if (who.includes('@')) {
    const sql = useDatabase()
    const ids = (await sql`
      SELECT DISTINCT person_id FROM contact_infos WHERE type = 'email' AND LOWER(value) = ${who.toLowerCase()}
    `) as any[]
    member = roster.find((m) => ids.some((x) => x.person_id === m.person_id))
  }
  if (!member) throw createError({ statusCode: 400, message: 'person is not on the frozen roster of this round' })
  if (member.conflict && choice !== 'blank') {
    throw createError({ statusCode: 400, message: 'This member is marked as conflicted and can only vote blank' })
  }

  const sql = useDatabase()
  if (sourceRef) {
    const dup = (await sql`
      SELECT id, person_id, choice, cast_at FROM deal_ballots WHERE round_id = ${roundId} AND source_ref = ${sourceRef}
    `) as any[]
    if (dup.length) {
      return { ballot: ballotOut(dup[0], r), duplicate: true, tally: await tallyOf(r) }
    }
  }
  const rows = (await sql`
    INSERT INTO deal_ballots (round_id, person_id, choice, reason, method, auth, source_ref, note, registered_by, cast_at)
    VALUES (${roundId}, ${member.person_id}, ${choice}, ${reason}, ${method}, ${auth}, ${sourceRef}, ${note},
            ${registeredBy}, ${castAt})
    RETURNING id, person_id, choice, cast_at
  `) as any[]
  return { ballot: ballotOut(rows[0], r), duplicate: false, tally: await tallyOf(r) }
}

function ballotOut(b: any, r: any) {
  return {
    id: b.id,
    personId: b.person_id,
    choice: b.choice,
    castAt: b.cast_at,
    late: new Date(b.cast_at).getTime() > new Date(r.closes_at).getTime(),
  }
}

/** Everything the committee and the admin API see of a round: roster, named ballots, notices. */
export async function roundDetail(roundId: string) {
  const r = await loadRound(roundId)
  if (!r) throw createError({ statusCode: 404, message: 'Round not found' })
  const sql = useDatabase()
  const [all, notices] = await Promise.all([
    sql`
      SELECT b.person_id, p.name, b.choice, b.method, b.cast_at, b.registered_by
      FROM deal_ballots b JOIN persons p ON p.id = b.person_id
      WHERE b.round_id = ${roundId}
      ORDER BY b.cast_at
    `,
    sql`
      SELECT person_id, channel, kind, sent_at, delivery FROM deal_round_notices
      WHERE round_id = ${roundId} ORDER BY sent_at
    `,
  ])
  const closesAt = r.closes_at ? new Date(r.closes_at).getTime() : null
  return {
    round: await withTally(r),
    roster: ((r.roster ?? []) as RosterEntry[]).map((m) => ({
      personId: m.person_id,
      name: m.name,
      email: m.email,
      defaultVote: m.default_vote,
      conflict: m.conflict,
    })),
    ballots: (all as any[]).map((b) => ({
      personId: b.person_id,
      name: b.name,
      choice: b.choice,
      method: b.method,
      castAt: b.cast_at,
      late: closesAt !== null && new Date(b.cast_at).getTime() > closesAt,
    })),
    notices: (notices as any[]).map((n) => ({
      personId: n.person_id,
      channel: n.channel,
      kind: n.kind,
      sentAt: n.sent_at,
      delivery: n.delivery,
    })),
    _row: r,
  }
}

export async function listRounds(status: string | null) {
  if (status && !['draft', 'open', 'closed', 'cancelled'].includes(status)) {
    throw createError({ statusCode: 400, message: 'status must be draft, open, closed or cancelled' })
  }
  const sql = useDatabase()
  const rows = await sql`
    SELECT r.*, pd.slug AS deal_slug, o.name AS deal_name, ng.slug AS group_slug
    FROM deal_rounds r
    JOIN pipeline_deals pd ON pd.id = r.deal_id
    JOIN organizations o ON o.id = pd.organization_id
    JOIN network_groups ng ON ng.id = r.group_id
    WHERE (${status}::text IS NULL OR r.status = ${status}) AND r.source = 'portal'
    ORDER BY r.created_at DESC
    LIMIT 100
  `
  return Promise.all((rows as any[]).map(withTally))
}

/**
 * Close a round once its 48 hours are up: count, freeze the snapshot, render
 * the protocol PDF (who took part, not what they chose) to GCS with its hash,
 * log round_closed. Idempotent: a closed round returns its frozen result.
 */
export async function closeRound(roundId: string, byPersonId: string | null) {
  const r = await loadRound(roundId)
  if (!r) throw createError({ statusCode: 404, message: 'Round not found' })
  if (r.status === 'closed') return closedOut(r)
  if (r.status !== 'open') throw createError({ statusCode: 409, message: `Round is ${r.status}` })
  if (new Date(r.closes_at).getTime() > Date.now()) {
    throw createError({ statusCode: 409, message: `The vote runs until ${new Date(r.closes_at).toISOString()}` })
  }

  const { current, late } = await loadBallots(roundId)
  const { tally, rows } = countRound(r.roster, current, late)
  const result = resultOf(tally)
  const snapshot = {
    tally,
    rules: r.rules,
    bundle_sha256: r.bundle_sha256,
    ballots: rows.map((x) => ({
      person_id: x.member.person_id,
      name: x.member.name,
      counted: x.counted,
      method: x.ballot?.method ?? null,
      cast_at: x.ballot?.cast_at ?? null,
      late: x.late,
    })),
    computed_at: new Date().toISOString(),
  }

  const pdf = await renderVoteProtocolPdf({
    round: r,
    tally,
    result,
    participants: rows.filter((x) => x.ballot).map((x) => ({ name: x.member.name, method: x.ballot!.method })),
    absent: rows.filter((x) => !x.ballot).map((x) => ({ name: x.member.name, late: x.late })),
  })
  const sha = createHash('sha256').update(pdf).digest('hex')
  const objectKey = `protocols/${r.deal_slug}/${r.id}-${sha.slice(0, 8)}.pdf`
  try {
    await writeDealDocumentObject(objectKey, pdf, 'application/pdf')
  } catch (err: any) {
    // A concurrent close wrote the same bytes first: fine, the UPDATE below decides.
    if (err?.code !== 412 && err?.code !== 'EEXIST') throw err
  }

  const sql = useDatabase()
  const [updated] = await sql.transaction([
    sql`
      UPDATE deal_rounds
      SET status = 'closed', closed_at = NOW(), closed_by = ${byPersonId}, result = ${result},
          result_snapshot = ${JSON.stringify(snapshot)}::jsonb, result_sha256 = ${sha},
          protocol_object_key = ${objectKey}
      WHERE id = ${roundId} AND status = 'open'
      RETURNING id
    `,
    sql`
      INSERT INTO deal_events (deal_id, occurred_at, kind, body, source_kind, created_by)
      SELECT ${r.deal_id}, NOW(), 'round_closed',
             ${`Vote closed for ${r.group_slug}: ${result}. Yes ${tally.yes}, no ${tally.no}, blank ${tally.blank + tally.defaultBlank}, not voted ${tally.notVoted}.`},
             'manual', 'portal'
      WHERE EXISTS (SELECT 1 FROM deal_rounds WHERE id = ${roundId} AND status = 'closed' AND result_sha256 = ${sha})
    `,
  ])
  void updated
  return closedOut(await loadRound(roundId))
}

async function closedOut(r: any) {
  return {
    round: await withTally(r),
    protocol: r.result_sha256 ? { sha256: r.result_sha256 } : null,
  }
}

/** The protocol PDF bytes of a closed round. */
export async function readProtocol(r: any): Promise<Buffer> {
  if (r.status !== 'closed' || !r.protocol_object_key) {
    throw createError({ statusCode: 404, message: 'No protocol yet' })
  }
  return (await readDealDocumentObject(r.protocol_object_key)).data
}

// --- Notices: the portal sends the mail, the job triggers it ---------------------------

export const NOTICE_KINDS = ['open', 'reminder', 'result'] as const
type NoticeKind = (typeof NOTICE_KINDS)[number]

const nok = (amount: number, currency: string) =>
  `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(amount)} ${currency}`

const osloStamp = (value: string | Date, lang: 'nb' | 'en') =>
  new Date(value).toLocaleString(lang === 'nb' ? 'nb-NO' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Oslo',
  })

function noticeMail(
  kind: NoticeKind,
  lang: 'nb' | 'en',
  r: any,
  to: { name: string },
  link: string,
  tally: Tally | null,
) {
  const nb = lang === 'nb'
  const company = escapeHtml(r.deal_name)
  const p = r.proposal ?? {}
  const offer = p.amount ? `${nok(p.amount, p.currency ?? 'NOK')}, ${escapeHtml(String(p.instrument ?? ''))}` : ''
  const closes = escapeHtml(osloStamp(r.closes_at, lang))
  const hi = mailParagraph(nb ? `Hei ${firstNameHtml(to.name)},` : `Hi ${firstNameHtml(to.name)},`)
  const rule = mailParagraph(
    nb
      ? 'Forslaget vedtas med minst 2/3 ja av ja- og nei-stemmene. Blanke og de som ikke stemmer telles ikke. Underveis ser medlemmene antall stemmer, ikke hvem som stemte hva.'
      : 'The proposal passes with at least 2/3 yes of the yes and no votes. Blank votes and members who do not vote are not counted. While it runs, members see the counts, not who voted what.',
    'color: #777; font-size: 14px;',
  )
  if (kind === 'open') {
    return {
      subject: nb
        ? `Avstemning: ${r.deal_name}, frist ${osloStamp(r.closes_at, 'nb')}`
        : `Vote: ${r.deal_name}, closes ${osloStamp(r.closes_at, 'en')}`,
      html: mailLayout([
        hi,
        mailParagraph(
          nb
            ? `Komiteen anbefaler at SPV-en investerer i ${company}${offer ? `: ${offer}` : ''}. Du har frist til ${closes} med å stemme ja, nei eller blankt. Materialet, spørsmål og svar ligger på casen.`
            : `The committee recommends that the SPV invests in ${company}${offer ? `: ${offer}` : ''}. You have until ${closes} to vote yes, no or blank. The material and the Q&A are on the case page.`,
        ),
        mailButton(link, nb ? 'Stem her' : 'Vote here'),
        rule,
      ]),
    }
  }
  if (kind === 'reminder') {
    return {
      subject: nb
        ? `Påminnelse: avstemningen om ${r.deal_name} stenger snart`
        : `Reminder: the vote on ${r.deal_name} closes soon`,
      html: mailLayout([
        hi,
        mailParagraph(
          nb
            ? `Avstemningen om ${company} stenger ${closes}, og du har ikke stemt ennå.`
            : `The vote on ${company} closes ${closes}, and you have not voted yet.`,
        ),
        mailButton(link, nb ? 'Stem her' : 'Vote here'),
        rule,
      ]),
    }
  }
  const passed = r.result === 'passed'
  const counts = tally
    ? nb
      ? `Ja ${tally.yes}, nei ${tally.no}, blankt ${tally.blank + tally.defaultBlank}, ikke stemt ${tally.notVoted}.`
      : `Yes ${tally.yes}, no ${tally.no}, blank ${tally.blank + tally.defaultBlank}, did not vote ${tally.notVoted}.`
    : ''
  const verdict = nb
    ? { passed: 'vedtatt', failed: 'ikke vedtatt', no_quorum: 'ikke vedtatt (ingen ja- eller nei-stemmer)' }[
        r.result as string
      ]
    : { passed: 'approved', failed: 'not approved', no_quorum: 'not approved (no yes or no votes)' }[r.result as string]
  return {
    subject: nb
      ? `Resultat: ${r.deal_name} ble ${passed ? 'vedtatt' : 'ikke vedtatt'}`
      : `Result: ${r.deal_name} was ${passed ? 'approved' : 'not approved'}`,
    html: mailLayout([
      hi,
      mailParagraph(
        nb
          ? `Avstemningen om ${company} er avsluttet: ${verdict}. ${counts}`
          : `The vote on ${company} has closed: ${verdict}. ${counts}`,
      ),
      mailParagraph(
        nb
          ? 'Protokollen er vedlagt. Den viser hvem som deltok, ikke hva hver enkelt stemte.'
          : 'The protocol is attached. It shows who took part, not what each person voted.',
      ),
      mailButton(link, nb ? 'Se casen' : 'See the case'),
    ]),
  }
}

/**
 * Mail one kind of notice to the roster and record each one in
 * deal_round_notices. open: everyone; reminder: those with no ballot and no
 * standing default; result: everyone, with the protocol attached. A member who
 * already got this kind by mail is skipped, so a retry sends only what is missing.
 */
export async function notifyRound(roundId: string, kind: unknown, opts: { dryRun: boolean; siteUrl: string }) {
  if (!NOTICE_KINDS.includes(kind as NoticeKind))
    throw createError({ statusCode: 400, message: 'kind must be open, reminder or result' })
  const k = kind as NoticeKind
  const r = await loadRound(roundId)
  if (!r) throw createError({ statusCode: 404, message: 'Round not found' })
  if (k === 'result' ? r.status !== 'closed' : r.status !== 'open') {
    throw createError({
      statusCode: 409,
      message: `Round is ${r.status}; ${k} needs it ${k === 'result' ? 'closed' : 'open'}`,
    })
  }
  const sql = useDatabase()
  const sentRows = (await sql`
    SELECT person_id FROM deal_round_notices WHERE round_id = ${roundId} AND channel = 'email' AND kind = ${k}
  `) as any[]
  const already = new Set(sentRows.map((x) => x.person_id))
  const { current } = await loadBallots(roundId)
  const voted = new Set(current.map((b) => b.person_id))
  const tally = await tallyOf(r)
  const pdf = k === 'result' ? await readProtocol(r) : null
  const link = `${opts.siteUrl}/member/caser/${r.deal_slug}`

  const sent: { personId: string; providerRef: string | null }[] = []
  const skipped: { personId: string; reason: string }[] = []
  const failed: { personId: string; error: string }[] = []
  for (const m of r.roster as RosterEntry[]) {
    if (already.has(m.person_id)) {
      skipped.push({ personId: m.person_id, reason: 'already_sent' })
      continue
    }
    if (k === 'reminder' && (voted.has(m.person_id) || m.default_vote)) {
      skipped.push({ personId: m.person_id, reason: 'voted' })
      continue
    }
    const target = await personMailTarget(m.person_id)
    if (!target) {
      skipped.push({ personId: m.person_id, reason: 'no_email' })
      continue
    }
    if (opts.dryRun) {
      sent.push({ personId: m.person_id, providerRef: null })
      continue
    }
    try {
      const lang = (await getChapters(m.person_id)).includes('no') ? 'nb' : 'en'
      const mail = noticeMail(k, lang, r, target, link, tally)
      const { id } = await sendMail({
        to: target.email,
        subject: mail.subject,
        html: mail.html,
        attachments: pdf ? [{ filename: `protokoll-${r.deal_slug}.pdf`, content: pdf }] : undefined,
      })
      await sql`
        INSERT INTO deal_round_notices (round_id, person_id, channel, kind, sent_at, provider_ref)
        VALUES (${roundId}, ${m.person_id}, 'email', ${k}, NOW(), ${id})
        ON CONFLICT DO NOTHING
      `
      sent.push({ personId: m.person_id, providerRef: id })
    } catch (err: any) {
      failed.push({ personId: m.person_id, error: String(err?.message ?? err).slice(0, 200) })
    }
  }
  return { sent, skipped, failed, dryRun: opts.dryRun }
}

/** Record notices the portal did not send itself (a Slack post), for every roster member. */
export async function recordNotices(roundId: string, body: Record<string, unknown>) {
  const KEYS = ['channel', 'kind', 'sentAt', 'providerRef']
  const extra = Object.keys(body).filter((k) => !KEYS.includes(k))
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
  if (body.channel !== 'slack')
    throw createError({ statusCode: 400, message: 'channel must be slack (mail is recorded by notify)' })
  if (!NOTICE_KINDS.includes(body.kind as NoticeKind))
    throw createError({ statusCode: 400, message: 'kind must be open, reminder or result' })
  if (typeof body.sentAt !== 'string' || Number.isNaN(Date.parse(body.sentAt))) {
    throw createError({ statusCode: 400, message: 'sentAt must be an ISO timestamp' })
  }
  const providerRef = typeof body.providerRef === 'string' ? body.providerRef.slice(0, 200) : null
  const r = await loadRound(roundId)
  if (!r) throw createError({ statusCode: 404, message: 'Round not found' })
  if (!Array.isArray(r.roster)) throw createError({ statusCode: 409, message: 'Round has no roster yet (not opened)' })
  const ids = (r.roster as RosterEntry[]).map((m) => m.person_id)
  const sql = useDatabase()
  const rows = await sql`
    INSERT INTO deal_round_notices (round_id, person_id, channel, kind, sent_at, provider_ref)
    SELECT ${roundId}, pid, 'slack', ${body.kind as string}, ${body.sentAt}, ${providerRef}
    FROM unnest(${ids}::uuid[]) AS pid
    ON CONFLICT DO NOTHING
    RETURNING person_id
  `
  return { recorded: rows.length }
}

// --- The case page's view of its rounds ----------------------------------------------

/**
 * The rounds on a case as this viewer may see them. Everyone who can see the
 * case gets the counts (live while open). A roster member gets their own
 * ballot. Staff also get drafts and the named list: every roster member with
 * what they voted, how and when (decision 2026-10-22 §3: names to the
 * committee only).
 */
export async function caseRoundsView(viewer: CaseViewer, dealId: string) {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT r.*, pd.slug AS deal_slug, o.name AS deal_name, ng.slug AS group_slug, ng.name AS group_name
    FROM deal_rounds r
    JOIN pipeline_deals pd ON pd.id = r.deal_id
    JOIN organizations o ON o.id = pd.organization_id
    JOIN network_groups ng ON ng.id = r.group_id
    WHERE r.deal_id = ${dealId}
      AND (${viewer.isStaff} OR r.status IN ('open', 'closed'))
    ORDER BY (r.status = 'open') DESC, r.created_at DESC
  `) as any[]
  return Promise.all(
    rows.map(async (r) => {
      const roster: RosterEntry[] = Array.isArray(r.roster) ? r.roster : []
      const me = roster.find((m) => m.person_id === viewer.personId) ?? null
      let tally: Tally | null = null
      let named: any[] | undefined
      let myBallot: { choice: string; castAt: string; method: string } | null = null
      if (roster.length) {
        const { current, late } = await loadBallots(r.id)
        const counted = countRound(roster, current, late)
        tally = r.status === 'closed' && r.result_snapshot?.tally ? r.result_snapshot.tally : counted.tally
        const mine = current.find((b) => b.person_id === viewer.personId)
        if (mine) myBallot = { choice: mine.choice, castAt: mine.cast_at, method: mine.method }
        if (viewer.isStaff) {
          named = counted.rows.map((x) => ({
            name: x.member.name,
            counted: x.counted,
            method: x.ballot?.method ?? null,
            castAt: x.ballot?.cast_at ?? null,
            late: x.late,
          }))
        }
      } else if (r.status === 'closed' && r.result_snapshot) {
        // Email-era history (source = backfill): counts only.
        const s = r.result_snapshot
        tally = {
          eligible: Number(s.ballots ?? 0),
          yes: Number(s.yes ?? 0),
          no: Number(s.no ?? 0),
          blank: Number(s.blank ?? 0),
          defaultBlank: 0,
          notVoted: 0,
          late: 0,
          turnout: 1,
        }
      }
      return {
        id: r.id,
        group: { slug: r.group_slug, name: r.group_name },
        status: r.status,
        source: r.source,
        openedAt: r.opened_at,
        closesAt: r.closes_at,
        closedAt: r.closed_at,
        result: r.result,
        proposal: r.source === 'portal' ? r.proposal : null,
        bundleSha256: r.bundle_sha256,
        tally,
        hasProtocol: Boolean(r.protocol_object_key),
        me: me
          ? { onRoster: true, defaultVote: me.default_vote, conflict: me.conflict, ballot: myBallot }
          : { onRoster: false, defaultVote: null, conflict: false, ballot: null },
        ...(viewer.isStaff ? { named, canOpen: r.status === 'draft' && viewer.isCommittee } : {}),
      }
    }),
  )
}

/** A round on this deal, or 404 (for the member routes under /api/member/deals/:slug/rounds/:id). */
export async function requireRoundOfDeal(dealId: string, roundId: string) {
  const r = await loadRound(roundId)
  if (!r || r.deal_id !== dealId) throw createError({ statusCode: 404, message: 'Round not found' })
  return r
}

/** Open rounds this member is on the roster of and has not voted in: the /member banner. */
export async function openVotesFor(personId: string) {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT r.id, r.closes_at, pd.slug, o.name, ng.name AS group_name
    FROM deal_rounds r
    JOIN pipeline_deals pd ON pd.id = r.deal_id
    JOIN organizations o ON o.id = pd.organization_id
    JOIN network_groups ng ON ng.id = r.group_id
    WHERE r.status = 'open' AND r.closes_at > NOW()
      AND r.roster @> ${JSON.stringify([{ person_id: personId }])}::jsonb
      AND NOT EXISTS (SELECT 1 FROM deal_ballots b WHERE b.round_id = r.id AND b.person_id = ${personId})
    ORDER BY r.closes_at
  `) as any[]
  return rows.map((r) => ({ roundId: r.id, slug: r.slug, name: r.name, group: r.group_name, closesAt: r.closes_at }))
}
