import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import {
  type BallotKind,
  type CountBase,
  countOpenItem,
  countSecretItem,
  decide,
  finalOutcome,
  type ItemRules,
  isBallotKind,
  isCountBase,
  isMeetingChoice,
  isPreset,
  itemProtocolText,
  type MeetingChoice,
  type Outcome,
  presentFrom,
  rulesFor,
} from './voteRules.ts'

/**
 * The forening's general meeting (årsmøte) in the portal: one meeting, several
 * saker, attendance, live open/close by the chair, open or secret ballots, a
 * protocol per sak. Tables: general_meetings, meeting_items, meeting_attendance,
 * meeting_ballots, meeting_ballot_receipts, meeting_secret_ballots, meeting_events
 * (ctoroundtable-hq migration 045). All meeting SQL lives here; the counting rules
 * are pure, in voteRules.ts. Design: ctori-4 memory votes/meeting-votes-design.md.
 *
 * This is NOT the deal vote (dealRounds.ts) and shares no table or gate with it.
 * Deals are run by the investment committee (current-komite), never the board.
 * A general meeting is run by the board (styret) and, during the session, the
 * chair the meeting elected. Nothing here checks the committee.
 */

export const MEETING_KINDS = ['ordinary', 'extraordinary', 'trial'] as const
export type MeetingKind = (typeof MEETING_KINDS)[number]

/** Whose members vote: the Norwegian forening, or the board itself for a rehearsal. */
export const ROSTER_GROUP: Record<MeetingKind, string> = {
  ordinary: 'cto-roundtable',
  extraordinary: 'cto-roundtable',
  trial: 'styret',
}

export interface MeetingRosterEntry {
  person_id: string
  name: string
  eligible: boolean
  ineligible_reason: string | null
}

export interface MeetingViewer {
  personId: string
  isBoard: boolean
  /** Norwegian chapter: the forening's members. A Swedish-only member is not one. */
  isForeningMember: boolean
}

export async function meetingViewer(event: H3Event): Promise<MeetingViewer> {
  const session = event.context.session
  if (!session?.personId) throw createError({ statusCode: 401, message: 'Unauthorized' })
  const chapters: string[] = event.context.chapters ?? []
  return {
    personId: session.personId,
    isBoard: await isBoardMember(session.personId),
    isForeningMember: chapters.includes('no'),
  }
}

/**
 * The admin API's viewer (/api/admin/meetings/**, `ctr meetings`): the token's
 * owner, whom requireApiToken has just checked is an active `styret` member.
 * The board check is made again here with the session gate's own isBoardMember,
 * so the meeting gate never rests on the token gate alone. The admin routes
 * never call the member's own actions (castMeetingBallot, selfAttendance) or
 * registerMeetingBallot: nothing votes through a token.
 */
export async function meetingViewerForOwner(personId: string): Promise<MeetingViewer> {
  if (!(await isBoardMember(personId))) throw createError({ statusCode: 403, message: 'Board only' })
  return { personId, isBoard: true, isForeningMember: (await getChapters(personId)).includes('no') }
}

const UUID = /^[0-9a-f-]{36}$/i

async function loadMeeting(id: string) {
  if (!UUID.test(id)) return null
  const sql = useDatabase()
  const rows = (await sql`
    SELECT m.*, c.name AS chair_name, s.name AS secretary_name
    FROM general_meetings m
    LEFT JOIN persons c ON c.id = m.chair_person_id
    LEFT JOIN persons s ON s.id = m.secretary_person_id
    WHERE m.id = ${id}
  `) as any[]
  return rows[0] ?? null
}

async function loadItems(meetingId: string) {
  const sql = useDatabase()
  return (await sql`
    SELECT i.*, lb.name AS lot_by_name
    FROM meeting_items i LEFT JOIN persons lb ON lb.id = i.lot_by
    WHERE i.meeting_id = ${meetingId}
    ORDER BY i.position
  `) as any[]
}

async function loadItem(itemId: string) {
  if (!UUID.test(itemId)) return null
  const sql = useDatabase()
  const rows = (await sql`
    SELECT i.*, lb.name AS lot_by_name FROM meeting_items i LEFT JOIN persons lb ON lb.id = i.lot_by
    WHERE i.id = ${itemId}
  `) as any[]
  return rows[0] ?? null
}

const roster = (m: any): MeetingRosterEntry[] => (Array.isArray(m.roster) ? m.roster : [])
const isChair = (m: any, v: MeetingViewer) => Boolean(m.chair_person_id) && m.chair_person_id === v.personId

/**
 * Who may see a meeting: the board always; a draft only the board; a trial only
 * its roster (the board); a real meeting every member of the Norwegian forening.
 * Anyone else gets the 404 of a meeting that does not exist.
 */
function canSee(m: any, v: MeetingViewer): boolean {
  if (v.isBoard) return true
  if (m.status === 'draft') return false
  if (m.kind === 'trial') return roster(m).some((r) => r.person_id === v.personId)
  return v.isForeningMember
}

export async function requireMeeting(v: MeetingViewer, id: string | undefined) {
  const m = id ? await loadMeeting(id) : null
  if (!m || !canSee(m, v)) throw createError({ statusCode: 404, message: 'Meeting not found' })
  return m
}

function requireBoardViewer(v: MeetingViewer) {
  if (!v.isBoard) throw createError({ statusCode: 403, message: 'Board only' })
}

/** The chair's actions: the board, or the elected chair, during the session only. */
function requireRunner(m: any, v: MeetingViewer) {
  if (!v.isBoard && !isChair(m, v)) throw createError({ statusCode: 403, message: 'Only the chair or the board' })
  if (m.status !== 'in_session') throw createError({ statusCode: 409, message: 'The meeting is not in session' })
}

function logEvent(meetingId: string, itemId: string | null, kind: string, by: string | null, body: object = {}) {
  const sql = useDatabase()
  return sql`
    INSERT INTO meeting_events (meeting_id, item_id, kind, by_person_id, body)
    VALUES (${meetingId}, ${itemId}, ${kind}, ${by}, ${JSON.stringify(body)}::jsonb)
  `
}

/**
 * A guarded UPDATE (one that matches nothing when the state moved on) and its
 * log row, as ONE statement: the event is written only if the UPDATE changed a
 * row. Two statements in a batch would log an action that was refused. `update`
 * uses $1..$n for `params`; returns whether it landed.
 */
async function updateAndLog(
  update: string,
  params: unknown[],
  ev: { meetingId: string; itemId: string | null; kind: string; by: string | null; body?: object },
): Promise<boolean> {
  const n = params.length
  const rows = (await useDatabase().query(
    `WITH u AS (${update} RETURNING 1)
     INSERT INTO meeting_events (meeting_id, item_id, kind, by_person_id, body)
     SELECT $${n + 1}::uuid, $${n + 2}::uuid, $${n + 3}, $${n + 4}::uuid, $${n + 5}::jsonb FROM u LIMIT 1
     RETURNING id`,
    [...params, ev.meetingId, ev.itemId, ev.kind, ev.by, JSON.stringify(ev.body ?? {})],
  )) as any[]
  return rows.length > 0
}

function cleanText(value: unknown, field: string, max: number, required: boolean): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    if (required) throw createError({ statusCode: 400, message: `${field} is required` })
    return null
  }
  if (typeof value !== 'string') throw createError({ statusCode: 400, message: `${field} must be text` })
  const t = value.trim()
  if (t.length > max) throw createError({ statusCode: 400, message: `${field} is at most ${max} characters` })
  return t
}

function cleanTime(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw createError({ statusCode: 400, message: `${field} must be an ISO timestamp` })
  }
  return new Date(value).toISOString()
}

function refuseUnknown(body: Record<string, unknown>, keys: string[]) {
  const extra = Object.keys(body).filter((k) => !keys.includes(k))
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
}

// --- The board sets it up --------------------------------------------------------------

export async function createMeeting(v: MeetingViewer, body: Record<string, unknown>) {
  requireBoardViewer(v)
  refuseUnknown(body, ['kind', 'title', 'heldAt', 'place', 'countBase'])
  if (!MEETING_KINDS.includes(body.kind as MeetingKind)) {
    throw createError({ statusCode: 400, message: 'kind must be ordinary, extraordinary or trial' })
  }
  const kind = body.kind as MeetingKind
  const title = cleanText(body.title, 'title', 200, true)
  const place = cleanText(body.place, 'place', 200, false)
  const heldAt = cleanTime(body.heldAt, 'heldAt')
  const countBase: CountBase = body.countBase === undefined ? 'yes+no' : (body.countBase as CountBase)
  if (!isCountBase(countBase))
    throw createError({ statusCode: 400, message: 'countBase must be yes+no or yes+no+blank' })
  const sql = useDatabase()
  const [row] = (await sql`
    INSERT INTO general_meetings (kind, title, held_at, place, roster_group, count_base, created_by)
    VALUES (${kind}, ${title}, ${heldAt}, ${place}, ${ROSTER_GROUP[kind]}, ${countBase}, ${v.personId})
    RETURNING id
  `) as any[]
  await logEvent(row.id, null, 'created', v.personId, { kind })
  return meetingView(v, row.id)
}

/** Title, time, place, counting base until the session opens; chair and referent until it closes. */
export async function updateMeeting(v: MeetingViewer, id: string, body: Record<string, unknown>) {
  requireBoardViewer(v)
  refuseUnknown(body, ['title', 'heldAt', 'place', 'countBase', 'chair', 'secretary'])
  const m = await requireMeeting(v, id)
  if (m.status === 'closed' || m.status === 'cancelled') {
    throw createError({ statusCode: 409, message: `The meeting is ${m.status}` })
  }
  const setup = ['title', 'heldAt', 'place', 'countBase'].some((k) => k in body)
  if (setup && m.status === 'in_session') {
    throw createError({ statusCode: 409, message: 'The meeting is in session; only the chair and referent can change' })
  }
  const title = 'title' in body ? cleanText(body.title, 'title', 200, true) : m.title
  const place = 'place' in body ? cleanText(body.place, 'place', 200, false) : m.place
  const heldAt = 'heldAt' in body ? cleanTime(body.heldAt, 'heldAt') : m.held_at
  const countBase = 'countBase' in body ? body.countBase : m.count_base
  if (!isCountBase(countBase))
    throw createError({ statusCode: 400, message: 'countBase must be yes+no or yes+no+blank' })
  const chair = 'chair' in body ? await personOrNull(body.chair, 'chair') : m.chair_person_id
  const secretary = 'secretary' in body ? await personOrNull(body.secretary, 'secretary') : m.secretary_person_id
  const landed = await updateAndLog(
    `UPDATE general_meetings
     SET title = $2, place = $3, held_at = $4, count_base = $5, chair_person_id = $6, secretary_person_id = $7
     WHERE id = $1 AND status NOT IN ('closed', 'cancelled') AND (NOT $8 OR status <> 'in_session')`,
    [id, title, place, heldAt, countBase, chair, secretary, setup],
    {
      meetingId: id,
      itemId: null,
      kind: setup ? 'changed' : 'chair_set',
      by: v.personId,
      body: { fields: Object.keys(body), chair, secretary },
    },
  )
  if (!landed) throw createError({ statusCode: 409, message: 'The meeting changed meanwhile; reload' })
  return meetingView(v, id)
}

/** A chair or referent must be someone who can sign in to the portal. */
async function personOrNull(value: unknown, field: string): Promise<string | null> {
  if (value === null) return null
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw createError({ statusCode: 400, message: `${field} must be a person id or null` })
  }
  if ((await getChapters(value)).length === 0) {
    throw createError({ statusCode: 400, message: `${field} must be an active portal member` })
  }
  return value
}

function cleanItem(body: Record<string, unknown>, partial: boolean) {
  refuseUnknown(body, ['title', 'body', 'preset', 'ballot'])
  const out: { title?: string; body?: string | null; preset?: string; ballot?: BallotKind } = {}
  if (!partial || 'title' in body) out.title = cleanText(body.title, 'title', 300, true) as string
  if (!partial || 'body' in body) out.body = cleanText(body.body, 'body', 20000, false)
  if (!partial || 'preset' in body) {
    if (!isPreset(body.preset)) {
      throw createError({
        statusCode: 400,
        message: 'preset must be majority, two_thirds, three_quarters or three_quarters_present',
      })
    }
    out.preset = body.preset
  }
  if (!partial || 'ballot' in body) {
    const ballot = body.ballot === undefined && !partial ? 'open' : body.ballot
    if (!isBallotKind(ballot)) throw createError({ statusCode: 400, message: 'ballot must be open or secret' })
    out.ballot = ballot
  }
  return out
}

/** Saker are added and edited before the session opens (the saksliste, § 5.2). */
export async function addItem(v: MeetingViewer, meetingId: string, body: Record<string, unknown>) {
  requireBoardViewer(v)
  const m = await requireMeeting(v, meetingId)
  if (m.status !== 'draft' && m.status !== 'announced') {
    throw createError({ statusCode: 409, message: 'Saker are added before the session opens' })
  }
  const item = cleanItem(body, false)
  const rules = rulesFor(item.preset as any, m.count_base, item.ballot as BallotKind)
  const sql = useDatabase()
  const [row] = (await sql`
    INSERT INTO meeting_items (meeting_id, position, title, body, preset, ballot, rules)
    VALUES (${meetingId},
            (SELECT COALESCE(MAX(position), 0) + 1 FROM meeting_items WHERE meeting_id = ${meetingId}),
            ${item.title}, ${item.body}, ${item.preset}, ${item.ballot}, ${JSON.stringify(rules)}::jsonb)
    RETURNING id, position
  `) as any[]
  await logEvent(meetingId, row.id, 'item_added', v.personId, {
    position: row.position,
    preset: item.preset,
    ballot: item.ballot,
  })
  return meetingView(v, meetingId)
}

export async function updateItem(v: MeetingViewer, meetingId: string, itemId: string, body: Record<string, unknown>) {
  requireBoardViewer(v)
  const m = await requireMeeting(v, meetingId)
  const it = await requireItemOf(m, itemId)
  if ((m.status !== 'draft' && m.status !== 'announced') || it.status !== 'pending') {
    throw createError({ statusCode: 409, message: 'A sak is edited before the session opens' })
  }
  const patch = cleanItem(body, true)
  const preset = patch.preset ?? it.preset
  const ballot = patch.ballot ?? it.ballot
  const rules = rulesFor(preset, m.count_base, ballot)
  const landed = await updateAndLog(
    `UPDATE meeting_items SET title = $2, body = $3, preset = $4, ballot = $5, rules = $6::jsonb
     WHERE id = $1 AND status = 'pending'
       AND EXISTS (SELECT 1 FROM general_meetings g WHERE g.id = meeting_id AND g.status IN ('draft', 'announced'))`,
    [itemId, patch.title ?? it.title, 'body' in patch ? patch.body : it.body, preset, ballot, JSON.stringify(rules)],
    { meetingId, itemId, kind: 'item_changed', by: v.personId, body: { fields: Object.keys(body) } },
  )
  if (!landed) throw createError({ statusCode: 409, message: 'A sak is edited before the session opens' })
  return meetingView(v, meetingId)
}

/** A pending sak is withdrawn (before or during the session), with a reason. */
export async function withdrawItem(v: MeetingViewer, meetingId: string, itemId: string, reason: unknown) {
  const m = await requireMeeting(v, meetingId)
  if (m.status === 'in_session') requireRunner(m, v)
  else requireBoardViewer(v)
  if (m.status === 'closed' || m.status === 'cancelled')
    throw createError({ statusCode: 409, message: `The meeting is ${m.status}` })
  await requireItemOf(m, itemId)
  const why = cleanText(reason, 'reason', 300, true)
  const landed = await updateAndLog(
    `UPDATE meeting_items SET status = 'withdrawn', withdraw_reason = $2 WHERE id = $1 AND status = 'pending'`,
    [itemId, why],
    { meetingId, itemId, kind: 'item_withdrawn', by: v.personId, body: { reason: why } },
  )
  if (!landed) throw createError({ statusCode: 409, message: 'Only a sak not yet voted on can be withdrawn' })
  return meetingView(v, meetingId)
}

async function requireItemOf(m: any, itemId: string | undefined) {
  const it = itemId ? await loadItem(itemId) : null
  if (!it || it.meeting_id !== m.id) throw createError({ statusCode: 404, message: 'Sak not found' })
  return it
}

/**
 * § 5.3 hook. When kontingent is introduced, a member needs to have paid for
 * `period` to vote. The payment source does not exist yet, so a meeting that
 * asks for it is refused here rather than given a roster that ignores it. When
 * it exists: return a map person id -> null (paid) or a reason, and the roster
 * marks them `eligible: false` with that reason; they can still attend.
 */
export async function duesStatus(_personIds: string[], _period: string): Promise<Map<string, string | null>> {
  throw createError({
    statusCode: 400,
    message: 'Kontingentsjekk er ikke bygget ennå. Lås manntallet uten krav om betalt kontingent.',
  })
}

/** The roster as it is right now: active members of the meeting's group (retired are out). */
export async function currentRoster(m: any): Promise<MeetingRosterEntry[]> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT p.id, p.name
    FROM memberships ms
    JOIN persons p ON p.id = ms.person_id
    JOIN network_groups ng ON ng.id = ms.group_id
    WHERE ng.slug = ${m.roster_group} AND p.status = 'active'
    ORDER BY p.name, p.id
  `) as any[]
  const dues = m.requires_paid_dues
    ? await duesStatus(
        rows.map((r) => r.id),
        m.dues_period,
      )
    : null
  return rows.map((r) => {
    const reason = dues?.get(r.id) ?? null
    return { person_id: r.id, name: r.name, eligible: reason === null, ineligible_reason: reason }
  })
}

export function rosterSha256(entries: MeetingRosterEntry[]): string {
  const canonical = entries
    .map((e) => ({ person_id: e.person_id, name: e.name, eligible: e.eligible }))
    .sort((a, b) => a.person_id.localeCompare(b.person_id))
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

/** "Lås manntallet": the board freezes who votes, now. Again until the session opens. */
export async function freezeMeetingRoster(v: MeetingViewer, meetingId: string) {
  requireBoardViewer(v)
  const m = await requireMeeting(v, meetingId)
  if (m.status !== 'draft' && m.status !== 'announced') {
    throw createError({ statusCode: 409, message: 'The roster is frozen before the session opens' })
  }
  const entries = await currentRoster(m)
  if (entries.length === 0) throw createError({ statusCode: 400, message: `${m.roster_group} has no active members` })
  const sha = rosterSha256(entries)
  const landed = await updateAndLog(
    `UPDATE general_meetings SET roster = $2::jsonb, roster_frozen_at = NOW(), roster_frozen_by = $3, roster_sha256 = $4
     WHERE id = $1 AND status IN ('draft', 'announced')`,
    [meetingId, JSON.stringify(entries), v.personId, sha],
    {
      meetingId,
      itemId: null,
      kind: 'roster_frozen',
      by: v.personId,
      body: {
        count: entries.length,
        eligible: entries.filter((e) => e.eligible).length,
        sha256: sha,
        refreeze: Boolean(m.roster),
      },
    },
  )
  if (!landed) throw createError({ statusCode: 409, message: 'The roster is frozen before the session opens' })
  return meetingView(v, meetingId)
}

/** Publish the saksliste to the members: needs a frozen roster and at least one sak. */
export async function announceMeeting(v: MeetingViewer, meetingId: string) {
  requireBoardViewer(v)
  const m = await requireMeeting(v, meetingId)
  if (m.status !== 'draft') throw createError({ statusCode: 409, message: `The meeting is ${m.status}` })
  if (!m.roster) throw createError({ statusCode: 409, message: 'Freeze the roster first' })
  const items = (await loadItems(meetingId)).filter((i) => i.status !== 'withdrawn')
  if (!items.length) throw createError({ statusCode: 409, message: 'Add at least one sak first' })
  const landed = await updateAndLog(
    `UPDATE general_meetings SET status = 'announced' WHERE id = $1 AND status = 'draft'`,
    [meetingId],
    { meetingId, itemId: null, kind: 'announced', by: v.personId, body: { items: items.length } },
  )
  if (!landed) throw createError({ statusCode: 409, message: 'The meeting changed meanwhile; reload' })
  return meetingView(v, meetingId)
}

export async function cancelMeeting(v: MeetingViewer, meetingId: string, reason: unknown) {
  requireBoardViewer(v)
  const m = await requireMeeting(v, meetingId)
  if (m.status !== 'draft' && m.status !== 'announced') {
    throw createError({ statusCode: 409, message: `The meeting is ${m.status}` })
  }
  const why = cleanText(reason, 'reason', 300, true)
  const landed = await updateAndLog(
    `UPDATE general_meetings SET status = 'cancelled', cancel_reason = $2
     WHERE id = $1 AND status IN ('draft', 'announced')`,
    [meetingId, why],
    { meetingId, itemId: null, kind: 'cancelled', by: v.personId, body: { reason: why } },
  )
  if (!landed) throw createError({ statusCode: 409, message: 'The meeting changed meanwhile; reload' })
  return meetingView(v, meetingId)
}

/** The board opens the session (check-in starts) and closes it when every open sak is done. */
export async function setSession(v: MeetingViewer, meetingId: string, action: unknown) {
  requireBoardViewer(v)
  const m = await requireMeeting(v, meetingId)
  let landed = false
  if (action === 'open') {
    if (m.status !== 'announced') throw createError({ statusCode: 409, message: `The meeting is ${m.status}` })
    landed = await updateAndLog(
      `UPDATE general_meetings SET status = 'in_session', session_opened_at = NOW() WHERE id = $1 AND status = 'announced'`,
      [meetingId],
      { meetingId, itemId: null, kind: 'session_opened', by: v.personId },
    )
  } else if (action === 'close') {
    if (m.status !== 'in_session') throw createError({ statusCode: 409, message: `The meeting is ${m.status}` })
    const items = await loadItems(meetingId)
    if (items.some((i) => i.status === 'open')) {
      throw createError({ statusCode: 409, message: 'Close the open sak first' })
    }
    if (items.some((i) => i.result === 'tie' && !i.lot_outcome)) {
      throw createError({ statusCode: 409, message: 'Enter the lot for the tied sak first' })
    }
    // The guard repeats the checks above in SQL, so a sak opened meanwhile keeps the session open.
    landed = await updateAndLog(
      `UPDATE general_meetings SET status = 'closed', session_closed_at = NOW()
       WHERE id = $1 AND status = 'in_session'
         AND NOT EXISTS (SELECT 1 FROM meeting_items i WHERE i.meeting_id = $1
                         AND (i.status = 'open' OR (i.result = 'tie' AND i.lot_outcome IS NULL)))`,
      [meetingId],
      {
        meetingId,
        itemId: null,
        kind: 'session_closed',
        by: v.personId,
        body: { untreated: items.filter((i) => i.status === 'pending').length },
      },
    )
  } else {
    throw createError({ statusCode: 400, message: 'action must be open or close' })
  }
  if (!landed) throw createError({ statusCode: 409, message: 'The meeting changed meanwhile; reload' })
  return meetingView(v, meetingId)
}

// --- Attendance (§ 5.1) ------------------------------------------------------------------

async function presentIds(meetingId: string): Promise<string[]> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT person_id, present, at FROM meeting_attendance WHERE meeting_id = ${meetingId}
  `) as any[]
  return presentFrom(
    rows.map((r) => ({ person_id: r.person_id, present: r.present, at: new Date(r.at).toISOString() })),
  )
}

/** A roster member says "Jeg er til stede" (or leaves) while the meeting is in session. */
export async function selfAttendance(v: MeetingViewer, meetingId: string, present: unknown) {
  const m = await requireMeeting(v, meetingId)
  if (typeof present !== 'boolean') throw createError({ statusCode: 400, message: 'present must be true or false' })
  if (m.status !== 'in_session') throw createError({ statusCode: 409, message: 'The meeting is not in session' })
  if (!roster(m).some((r) => r.person_id === v.personId)) {
    throw createError({ statusCode: 403, message: 'You are not on the roster for this meeting' })
  }
  const sql = useDatabase()
  await sql`
    INSERT INTO meeting_attendance (meeting_id, person_id, present, method)
    VALUES (${meetingId}, ${v.personId}, ${present}, 'self')
  `
  return meetingView(v, meetingId)
}

/** The chair or the board checks a roster member in or out on their behalf, with a reason. */
export async function registerAttendance(
  v: MeetingViewer,
  meetingId: string,
  personId: string | undefined,
  body: Record<string, unknown>,
) {
  refuseUnknown(body, ['present', 'reason'])
  const m = await requireMeeting(v, meetingId)
  requireRunner(m, v)
  if (typeof body.present !== 'boolean')
    throw createError({ statusCode: 400, message: 'present must be true or false' })
  const who = roster(m).find((r) => r.person_id === personId)
  if (!who) throw createError({ statusCode: 400, message: 'That person is not on the roster' })
  const reason = cleanText(body.reason, 'reason', 300, true)
  const sql = useDatabase()
  await sql.transaction([
    sql`
      INSERT INTO meeting_attendance (meeting_id, person_id, present, method, registered_by, reason)
      VALUES (${meetingId}, ${who.person_id}, ${body.present}, 'on_behalf', ${v.personId}, ${reason})
    `,
    logEvent(meetingId, null, 'attendance_on_behalf', v.personId, { person_id: who.person_id, present: body.present }),
  ])
  return meetingView(v, meetingId)
}

// --- Saker: open, vote, close, lot ---------------------------------------------------------

/** The chair opens one sak. Its rule is snapshotted now, with the meeting's counting base. */
export async function openItem(v: MeetingViewer, meetingId: string, itemId: string | undefined) {
  const m = await requireMeeting(v, meetingId)
  requireRunner(m, v)
  const it = await requireItemOf(m, itemId)
  if (it.status !== 'pending') throw createError({ statusCode: 409, message: `The sak is ${it.status}` })
  const rules = rulesFor(it.preset, m.count_base, it.ballot)
  let landed: boolean
  try {
    landed = await updateAndLog(
      `UPDATE meeting_items SET status = 'open', opened_at = NOW(), opened_by = $2, rules = $3::jsonb
       WHERE id = $1 AND status = 'pending'
         AND EXISTS (SELECT 1 FROM general_meetings g WHERE g.id = meeting_id AND g.status = 'in_session')`,
      [it.id, v.personId, JSON.stringify(rules)],
      { meetingId, itemId: it.id, kind: 'item_opened', by: v.personId },
    )
  } catch (err: any) {
    if (err?.code === '23505') throw createError({ statusCode: 409, message: 'Another sak is open; close it first' })
    throw err
  }
  if (!landed) throw createError({ statusCode: 409, message: 'The sak or the meeting changed meanwhile; reload' })
  return meetingView(v, meetingId)
}

/**
 * A roster member votes on the open sak. They must be eligible and checked in
 * now. Open ballot: a new row each time, the latest counts until close. Secret
 * ballot: one receipt and one choice with no person, written together, final.
 */
export async function castMeetingBallot(
  v: MeetingViewer,
  meetingId: string,
  itemId: string | undefined,
  input: { choice: unknown; ip: string | null; userAgent: string | null },
) {
  if (!isMeetingChoice(input.choice)) throw createError({ statusCode: 400, message: 'choice must be yes, no or blank' })
  const m = await requireMeeting(v, meetingId)
  const it = await requireItemOf(m, itemId)
  if (m.status !== 'in_session' || it.status !== 'open') {
    throw createError({ statusCode: 409, message: 'Voting on this sak is closed' })
  }
  const me = roster(m).find((r) => r.person_id === v.personId)
  if (!me) throw createError({ statusCode: 403, message: 'You are not on the roster for this meeting' })
  if (!me.eligible)
    throw createError({ statusCode: 403, message: me.ineligible_reason ?? 'You have no vote at this meeting' })
  if (!(await presentIds(meetingId)).includes(v.personId)) {
    throw createError({ statusCode: 409, message: 'Register that you are present before you vote' })
  }
  const sql = useDatabase()
  try {
    if (it.ballot === 'secret') {
      await sql.transaction([
        sql`INSERT INTO meeting_ballot_receipts (item_id, person_id, method) VALUES (${it.id}, ${v.personId}, 'portal')`,
        sql`INSERT INTO meeting_secret_ballots (item_id, choice) VALUES (${it.id}, ${input.choice})`,
      ])
    } else {
      await sql`
        INSERT INTO meeting_ballots (item_id, person_id, choice, method, ip, user_agent)
        VALUES (${it.id}, ${v.personId}, ${input.choice}, 'portal', ${input.ip}::inet, ${input.userAgent?.slice(0, 500) ?? null})
      `
    }
  } catch (err: any) {
    if (err?.code === '23505')
      throw createError({ statusCode: 409, message: 'You have already voted on this secret ballot' })
    if (err?.code === '23514') throw createError({ statusCode: 409, message: 'Voting on this sak is closed' })
    throw err
  }
  return { ok: true }
}

/** The chair records an OPEN ballot for a present member who cannot use the portal. Never a secret one. */
export async function registerMeetingBallot(
  v: MeetingViewer,
  meetingId: string,
  itemId: string | undefined,
  body: Record<string, unknown>,
) {
  refuseUnknown(body, ['person', 'choice', 'reason'])
  const m = await requireMeeting(v, meetingId)
  requireRunner(m, v)
  const it = await requireItemOf(m, itemId)
  if (it.status !== 'open') throw createError({ statusCode: 409, message: 'Voting on this sak is closed' })
  if (it.ballot === 'secret') {
    throw createError({ statusCode: 400, message: "A secret ballot cannot be registered on someone else's behalf" })
  }
  if (!isMeetingChoice(body.choice)) throw createError({ statusCode: 400, message: 'choice must be yes, no or blank' })
  const who = roster(m).find((r) => r.person_id === body.person)
  if (!who) throw createError({ statusCode: 400, message: 'That person is not on the roster' })
  if (!who.eligible) throw createError({ statusCode: 400, message: 'That person has no vote at this meeting' })
  if (!(await presentIds(meetingId)).includes(who.person_id)) {
    throw createError({ statusCode: 409, message: 'Register them as present first' })
  }
  const reason = cleanText(body.reason, 'reason', 300, true)
  const sql = useDatabase()
  await sql.transaction([
    sql`
      INSERT INTO meeting_ballots (item_id, person_id, choice, method, registered_by, reason)
      VALUES (${it.id}, ${who.person_id}, ${body.choice as string}, 'on_behalf', ${v.personId}, ${reason})
    `,
    logEvent(meetingId, it.id, 'ballot_on_behalf', v.personId, { person_id: who.person_id }),
  ])
  return meetingView(v, meetingId)
}

async function countNow(m: any, it: any) {
  const sql = useDatabase()
  const ids = roster(m)
    .filter((r) => r.eligible)
    .map((r) => r.person_id)
  const present = await presentIds(m.id)
  if (it.ballot === 'secret') {
    const [receipts, choices] = await Promise.all([
      sql`SELECT person_id FROM meeting_ballot_receipts WHERE item_id = ${it.id}`,
      sql`SELECT choice FROM meeting_secret_ballots WHERE item_id = ${it.id}`,
    ])
    const counted = countSecretItem(
      ids,
      present,
      (receipts as any[]).map((r) => r.person_id),
      (choices as any[]).map((c) => c.choice as MeetingChoice),
    )
    return { ...counted, rows: { ballots: 0, receipts: (receipts as any[]).length } }
  }
  const ballots = (await sql`
    SELECT person_id, choice, cast_at, method FROM meeting_ballots WHERE item_id = ${it.id}
  `) as any[]
  const counted = countOpenItem(
    ids,
    present,
    ballots.map((b) => ({ person_id: b.person_id, choice: b.choice, cast_at: new Date(b.cast_at).toISOString() })),
  )
  return { ...counted, rows: { ballots: ballots.length, receipts: 0 } }
}

/**
 * The chair closes the open sak: count, freeze the protocol, done. The UPDATE
 * only lands if no ballot arrived after the count (the row counts must still
 * match, in a serializable transaction); otherwise it counts again. After it,
 * the 045 trigger refuses any ballot on the sak.
 */
export async function closeItem(v: MeetingViewer, meetingId: string, itemId: string | undefined) {
  const m = await requireMeeting(v, meetingId)
  requireRunner(m, v)
  const it = await requireItemOf(m, itemId)
  if (it.status !== 'open') throw createError({ statusCode: 409, message: `The sak is ${it.status}` })
  const names = new Map(roster(m).map((r) => [r.person_id, r.name]))
  const sql = useDatabase()
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await countNow(m, it)
    const rules = it.rules as ItemRules
    const decision = decide(c.counts, rules)
    const present = c.present.map((id) => ({ person_id: id, name: names.get(id) ?? id })).sort(byName)
    const snapshot = {
      rules,
      counts: c.counts,
      decision,
      present,
      voters:
        it.ballot === 'secret'
          ? (c.voters as string[]).map((id) => ({ person_id: id, name: names.get(id) ?? id })).sort(byName)
          : (c.voters as any[])
              .map((b) => ({ person_id: b.person_id, name: names.get(b.person_id) ?? b.person_id, choice: b.choice }))
              .sort(byName),
      roster_sha256: m.roster_sha256,
      computed_at: new Date().toISOString(),
    }
    const sha = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
    try {
      const [updated] = await sql.transaction(
        [
          sql`
            UPDATE meeting_items
            SET status = 'closed', closed_at = NOW(), closed_by = ${v.personId}, result = ${decision.outcome},
                result_snapshot = ${JSON.stringify(snapshot)}::jsonb, result_sha256 = ${sha}
            WHERE id = ${it.id} AND status = 'open'
              AND (SELECT count(*) FROM meeting_ballots WHERE item_id = ${it.id}) = ${c.rows.ballots}
              AND (SELECT count(*) FROM meeting_ballot_receipts WHERE item_id = ${it.id}) = ${c.rows.receipts}
            RETURNING id
          `,
          sql`
            INSERT INTO meeting_events (meeting_id, item_id, kind, by_person_id, body)
            SELECT ${meetingId}, ${it.id}, 'item_closed', ${v.personId},
                   ${JSON.stringify({ result: decision.outcome, ...c.counts, sha256: sha })}::jsonb
            WHERE EXISTS (SELECT 1 FROM meeting_items WHERE id = ${it.id} AND result_sha256 = ${sha})
          `,
        ],
        { isolationLevel: 'Serializable' },
      )
      if ((updated as any[]).length) return meetingView(v, meetingId)
      const now = await loadItem(it.id)
      if (now?.status !== 'open') throw createError({ statusCode: 409, message: `The sak is ${now?.status}` })
    } catch (err: any) {
      if (err?.code !== '40001') throw err
    }
  }
  throw createError({ statusCode: 409, message: 'Votes kept arriving while closing; try again' })
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'nb')

/**
 * § 5.5: a tie under simple majority is settled by lot, drawn by the chair in
 * the meeting (never by the server). The chair enters what the lot decided, and
 * how it was drawn; it is final.
 */
export async function recordLot(
  v: MeetingViewer,
  meetingId: string,
  itemId: string | undefined,
  body: Record<string, unknown>,
) {
  refuseUnknown(body, ['outcome', 'note'])
  const m = await requireMeeting(v, meetingId)
  requireRunner(m, v)
  const it = await requireItemOf(m, itemId)
  if (body.outcome !== 'passed' && body.outcome !== 'failed') {
    throw createError({ statusCode: 400, message: 'outcome must be passed or failed' })
  }
  const note = cleanText(body.note, 'note', 300, true)
  if (it.result !== 'tie') throw createError({ statusCode: 409, message: 'Only a tied sak is settled by lot' })
  const landed = await updateAndLog(
    `UPDATE meeting_items SET lot_outcome = $2, lot_by = $3, lot_at = NOW(), lot_note = $4
     WHERE id = $1 AND result = 'tie' AND lot_outcome IS NULL`,
    [it.id, body.outcome, v.personId, note],
    { meetingId, itemId: it.id, kind: 'lot_recorded', by: v.personId, body: { outcome: body.outcome, note } },
  )
  if (!landed) throw createError({ statusCode: 409, message: 'The lot is already recorded' })
  return meetingView(v, meetingId)
}

// --- What a viewer sees ------------------------------------------------------------------

export async function listMeetings(v: MeetingViewer) {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT m.id, m.kind, m.title, m.held_at, m.status, m.roster, m.created_at,
           (SELECT count(*)::int FROM meeting_items i WHERE i.meeting_id = m.id AND i.status <> 'withdrawn') AS items
    FROM general_meetings m
    ORDER BY COALESCE(m.held_at, m.created_at) DESC
    LIMIT 50
  `) as any[]
  return {
    canCreate: v.isBoard,
    meetings: rows
      .filter((m) => canSee(m, v))
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        title: m.title,
        heldAt: m.held_at,
        status: m.status,
        items: m.items,
        onRoster: roster(m).some((r) => r.person_id === v.personId),
      })),
  }
}

/** One meeting as this viewer may see it. The board and the chair get the roster and live progress. */
export async function meetingView(v: MeetingViewer, id: string) {
  const m = await requireMeeting(v, id)
  const items = await loadItems(id)
  const runner = v.isBoard || isChair(m, v)
  const r = roster(m)
  const me = r.find((x) => x.person_id === v.personId) ?? null
  const present = new Set(m.roster ? await presentIds(id) : [])
  const names = new Map(r.map((x) => [x.person_id, x.name]))
  const sql = useDatabase()

  const itemsOut = await Promise.all(
    items.map(async (it) => {
      const base = {
        id: it.id,
        position: it.position,
        title: it.title,
        body: it.body,
        preset: it.preset,
        ballot: it.ballot,
        rules: it.rules,
        status: it.status,
        openedAt: it.opened_at,
        closedAt: it.closed_at,
        withdrawReason: it.withdraw_reason,
        result: it.result as Outcome | null,
        finalOutcome: finalOutcome(it.result, it.lot_outcome),
        lot: it.lot_outcome ? { outcome: it.lot_outcome, note: it.lot_note, by: it.lot_by_name, at: it.lot_at } : null,
        myVote: null as null | { voted: boolean; choice: MeetingChoice | null },
        progress: null as null | { voted: number; present: number },
        counts: null as any,
        decision: null as any,
        named: null as null | { name: string; choice: MeetingChoice }[],
        voters: null as null | string[],
        protocolText: null as string | null,
      }
      if (it.status === 'open' || it.status === 'closed') {
        if (it.ballot === 'secret') {
          const mine = (await sql`
            SELECT 1 FROM meeting_ballot_receipts WHERE item_id = ${it.id} AND person_id = ${v.personId}
          `) as any[]
          base.myVote = { voted: mine.length > 0, choice: null }
        } else {
          const mine = (await sql`
            SELECT choice FROM meeting_ballots WHERE item_id = ${it.id} AND person_id = ${v.personId}
            ORDER BY cast_at DESC LIMIT 1
          `) as any[]
          base.myVote = { voted: mine.length > 0, choice: mine[0]?.choice ?? null }
        }
      }
      if (it.status === 'open') {
        // How many have voted, never how: the count is shown when the chair closes the sak.
        const c = await countNow(m, it)
        base.progress = { voted: c.counts.yes + c.counts.no + c.counts.blank, present: c.counts.present }
      }
      if (it.status === 'closed' && it.result_snapshot) {
        const s = it.result_snapshot
        base.counts = s.counts
        base.decision = s.decision
        if (it.ballot === 'open') base.named = (s.voters ?? []).map((x: any) => ({ name: x.name, choice: x.choice }))
        else base.voters = (s.voters ?? []).map((x: any) => x.name)
        base.protocolText = itemProtocolText({
          position: it.position,
          title: it.title,
          rules: s.rules,
          counts: s.counts,
          decision: s.decision,
          presentNames: (s.present ?? []).map((p: any) => p.name),
          ballot: it.ballot,
          lot: it.lot_outcome ? { outcome: it.lot_outcome, note: it.lot_note, byName: it.lot_by_name ?? '' } : null,
        })
      }
      return base
    }),
  )

  const seesAttendance = runner || Boolean(me)
  return {
    meeting: {
      id: m.id,
      kind: m.kind,
      title: m.title,
      heldAt: m.held_at,
      place: m.place,
      status: m.status,
      countBase: m.count_base,
      rosterGroup: m.roster_group,
      rosterFrozenAt: m.roster_frozen_at,
      rosterCount: r.length,
      rosterEligible: r.filter((x) => x.eligible).length,
      rosterSha256: m.roster_sha256,
      requiresPaidDues: m.requires_paid_dues,
      chair: m.chair_person_id ? { id: m.chair_person_id, name: m.chair_name } : null,
      secretary: m.secretary_person_id ? { id: m.secretary_person_id, name: m.secretary_name } : null,
      sessionOpenedAt: m.session_opened_at,
      sessionClosedAt: m.session_closed_at,
      cancelReason: m.cancel_reason,
    },
    me: {
      isBoard: v.isBoard,
      isChair: isChair(m, v),
      canRun: runner && m.status === 'in_session',
      onRoster: Boolean(me),
      eligible: me?.eligible ?? false,
      ineligibleReason: me?.ineligible_reason ?? null,
      present: present.has(v.personId),
    },
    attendance: seesAttendance
      ? {
          count: present.size,
          names: [...present].map((pid) => names.get(pid) ?? pid).sort((a, b) => a.localeCompare(b, 'nb')),
        }
      : null,
    roster: runner
      ? r.map((x) => ({ personId: x.person_id, name: x.name, eligible: x.eligible, present: present.has(x.person_id) }))
      : null,
    items: itemsOut,
  }
}

/** Data for the meeting's protocol PDF, from frozen snapshots only. */
export async function meetingProtocolData(v: MeetingViewer, id: string) {
  const view = await meetingView(v, id)
  const closed = view.items.filter((i) => i.status === 'closed')
  if (!closed.length) throw createError({ statusCode: 404, message: 'No sak has been voted on yet' })
  const sql = useDatabase()
  const attended = (await sql`
    SELECT DISTINCT a.person_id FROM meeting_attendance a WHERE a.meeting_id = ${id} AND a.present
  `) as any[]
  const m = await loadMeeting(id)
  const names = new Map(roster(m).map((r) => [r.person_id, r.name]))
  return {
    view,
    attended: attended.map((a) => names.get(a.person_id) ?? a.person_id).sort((a, b) => a.localeCompare(b, 'nb')),
    stampAt: m.session_closed_at ?? closed[closed.length - 1].closedAt,
  }
}
