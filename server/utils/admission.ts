// Member admission in the portal (vedtekter § 4.1): "Nye medlemmer vurderes av styret og
// godkjennes gjennom en avstemning blant eksisterende medlemmer." Snorre 2026-11-19,
// ctori-4 item admission-votes. hq migration 050.
//
// BUILT ON THE REGISTER THAT EXISTS (Snorre, same day): the candidate list is
// persons.status 'prospect' (migration 002: applied or proposed, not a member) plus
// pending join_requests, per group. Nothing here is a new candidate table.
//   - A vote hangs off a join_request. For a prospect with none, starting the vote
//     creates one (source 'manual', invited_by = the board member, Norway's group).
//   - The roster is the active members of 'cto-roundtable' (the Norwegian forening),
//     frozen at start with a sha256; retired and Swedish-only members are out.
//   - Secret ballot: a receipt (who) and a choice with no person (what), written in one
//     transaction, final. Nobody sees a tally while it runs, only the turnout.
//   - Fixed window (closes_at). Past it the vote is counted on the next read
//     (finalizeDue), or the board closes it early or cancels it.
//   - Counting is voteRules.ts through admissionRules.ts: § 5.5 majority of votes cast,
//     blank not cast (dc-76), a tie goes to the board's lot.
//   - Yes: the join_request becomes 'accepted' + resolved_at. The person stays a
//     prospect: making them active with a membership is the add-new-member step.
//   - No (or nobody voted yes/no): 'rejected'. A tie stays pending until the lot.
// Nothing here sends mail or Slack.
import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import {
  ADMISSION_ROSTER_GROUP,
  ADMISSION_RULES,
  type AdmissionStatus,
  closesAtFrom,
  countAdmission,
  isAdmissionStatus,
  joinRequestStatusAfter,
  voteState,
  windowDays,
} from './admissionRules.ts'
import { isMeetingChoice, neededFor } from './voteRules.ts'

/** The groups whose admission status the board sets. */
export const ADMISSION_GROUPS = ['cto-roundtable', 'roundtable-sweden'] as const

export interface AdmissionViewer {
  personId: string
  isBoard: boolean
  /** in the Norwegian chapter: may be on an admission roster */
  isNorway: boolean
}

export async function admissionViewer(event: H3Event): Promise<AdmissionViewer> {
  const session = event.context.session
  if (!session?.personId) throw createError({ statusCode: 401, message: 'Unauthorized' })
  const chapters: string[] = event.context.chapters ?? []
  return {
    personId: session.personId,
    isBoard: await isBoardMember(session.personId),
    isNorway: chapters.includes('no'),
  }
}

function requireBoardViewer(v: AdmissionViewer) {
  if (!v.isBoard) throw createError({ statusCode: 403, message: 'Board only' })
}

const UUID = /^[0-9a-f-]{36}$/i

// -------------------------------------------------------------------- group status

export async function admissionGroups() {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT ng.slug, ng.name, ng.admission_status, ng.admission_changed_at, p.name AS changed_by_name
    FROM network_groups ng LEFT JOIN persons p ON p.id = ng.admission_changed_by
    WHERE ng.slug = ANY(${ADMISSION_GROUPS as unknown as string[]})
    ORDER BY ng.slug = 'cto-roundtable' DESC, ng.slug
  `) as any[]
  return rows.map((r) => ({
    slug: r.slug as string,
    name: r.name as string,
    status: r.admission_status as AdmissionStatus,
    changedAt: r.admission_changed_at as string | null,
    changedBy: r.changed_by_name as string | null,
  }))
}

/** Public: is admission to the group open right now. */
export async function admissionStatusOf(slug: string): Promise<AdmissionStatus | null> {
  const sql = useDatabase()
  const rows = (await sql`SELECT admission_status FROM network_groups WHERE slug = ${slug}`) as any[]
  return rows[0]?.admission_status ?? null
}

export async function setAdmissionStatus(v: AdmissionViewer, slug: unknown, status: unknown) {
  requireBoardViewer(v)
  if (typeof slug !== 'string' || !(ADMISSION_GROUPS as readonly string[]).includes(slug)) {
    throw createError({ statusCode: 400, message: 'Unknown group' })
  }
  if (!isAdmissionStatus(status)) throw createError({ statusCode: 400, message: 'status must be open or closed' })
  const sql = useDatabase()
  await sql.transaction([
    setActor(sql, `portal:${v.personId}`),
    sql`
      UPDATE network_groups
      SET admission_status = ${status}, admission_changed_at = NOW(), admission_changed_by = ${v.personId}
      WHERE slug = ${slug}
    `,
  ])
  return admissionGroups()
}

// -------------------------------------------------------------------- the list

const candidateFields = (sql: ReturnType<typeof useDatabase>) => sql`
  (SELECT ci.value FROM contact_infos ci WHERE ci.person_id = p.id AND ci.type = 'linkedin'
     ORDER BY ci.is_primary DESC NULLS LAST LIMIT 1) AS linkedin,
  (SELECT o.name FROM person_organizations po JOIN organizations o ON o.id = po.organization_id
     WHERE po.person_id = p.id AND po.ended_at IS NULL ORDER BY po.is_primary DESC NULLS LAST LIMIT 1) AS org,
  (SELECT po.role_title FROM person_organizations po
     WHERE po.person_id = p.id AND po.ended_at IS NULL ORDER BY po.is_primary DESC NULLS LAST LIMIT 1) AS role_title
`

/**
 * The board's list: every prospect and every person with a pending join_request,
 * oldest first (the waitlist is FIFO), with the live vote if there is one.
 * `votable` is false for Sweden (§ 4.1 is the Norwegian forening) and for a
 * pensjonist's rejoin (§ 4.4: the board decides that alone).
 */
export async function listCandidates(v: AdmissionViewer) {
  requireBoardViewer(v)
  await finalizeDue()
  const sql = useDatabase()
  const rows = (await sql`
    SELECT p.id AS person_id, p.name, p.status AS person_status, p.created_at AS person_created_at,
      jr.id AS join_request_id, jr.status AS join_status, jr.why_join, jr.source, jr.created_at AS applied_at,
      COALESCE(ng.slug, ${ADMISSION_ROSTER_GROUP}) AS group_slug, inv.name AS invited_by,
      ${candidateFields(sql)},
      av.id AS vote_id, av.closes_at
    FROM persons p
    LEFT JOIN LATERAL (
      SELECT * FROM join_requests j WHERE j.person_id = p.id
      ORDER BY (j.status = 'pending') DESC, j.created_at DESC LIMIT 1
    ) jr ON true
    LEFT JOIN network_groups ng ON ng.id = jr.group_id
    LEFT JOIN persons inv ON inv.id = jr.invited_by
    LEFT JOIN admission_votes av ON av.join_request_id = jr.id AND av.closed_at IS NULL AND av.cancelled_at IS NULL
    WHERE (p.status = 'prospect' AND (jr.status IS NULL OR jr.status IN ('pending', 'accepted', 'timed_out')))
       OR jr.status = 'pending'
    ORDER BY COALESCE(jr.status = 'accepted', false), COALESCE(jr.created_at, p.created_at), p.name
  `) as any[]
  return rows.map((r) => {
    const rejoin = r.person_status === 'retired'
    const sweden = r.group_slug === 'roundtable-sweden'
    // Voted in: the application is accepted, the person is still a prospect until add-new-member.
    const accepted = r.join_status === 'accepted'
    // An old application that timed out is no open one: starting a vote opens a new one.
    const open = r.join_status === 'pending'
    return {
      personId: r.person_id as string,
      name: r.name as string,
      since: (open || accepted ? r.applied_at : r.person_created_at) as string,
      joinRequestId: open || accepted ? (r.join_request_id as string) : null,
      source: open || accepted ? (r.source as string | null) : null,
      group: r.group_slug as string,
      whyJoin: r.why_join as string | null,
      invitedBy: r.invited_by as string | null,
      linkedin: r.linkedin as string | null,
      org: r.org as string | null,
      roleTitle: r.role_title as string | null,
      kind: rejoin ? 'rejoin' : accepted ? 'accepted' : 'prospect',
      votable: !rejoin && !sweden && !accepted && !r.vote_id,
      liveVote: r.vote_id ? { id: r.vote_id as string, closesAt: r.closes_at as string } : null,
    }
  })
}

// -------------------------------------------------------------------- start a vote

async function activeRoster() {
  const sql = useDatabase()
  return (await sql`
    SELECT p.id AS person_id, p.name
    FROM memberships ms
    JOIN persons p ON p.id = ms.person_id
    JOIN network_groups ng ON ng.id = ms.group_id
    WHERE ng.slug = ${ADMISSION_ROSTER_GROUP} AND p.status = 'active'
    ORDER BY p.name, p.id
  `) as { person_id: string; name: string }[]
}

export function rosterSha(roster: { person_id: string; name: string }[]) {
  return createHash('sha256')
    .update(JSON.stringify(roster.map((r) => ({ person_id: r.person_id, name: r.name }))))
    .digest('hex')
}

export async function startAdmissionVote(v: AdmissionViewer, body: Record<string, unknown>) {
  requireBoardViewer(v)
  const personId = body.personId
  if (typeof personId !== 'string' || !UUID.test(personId)) {
    throw createError({ statusCode: 400, message: 'personId is required' })
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 4000) : ''
  const days = windowDays(body.days)
  const sql = useDatabase()

  const [person] = (await sql`SELECT id, name, status FROM persons WHERE id = ${personId}`) as any[]
  if (!person) throw createError({ statusCode: 404, message: 'No such person' })
  if (person.status === 'active') throw createError({ statusCode: 409, message: 'Already an active member' })
  if (person.status === 'retired') {
    throw createError({ statusCode: 409, message: 'A pensjonist comes back by the board decision (§ 4.4), not a vote' })
  }

  // The application the vote hangs off: the pending one, or a new manual one for a prospect.
  const [group] = (await sql`SELECT id FROM network_groups WHERE slug = ${ADMISSION_ROSTER_GROUP}`) as any[]
  if (!group) throw createError({ statusCode: 500, message: `${ADMISSION_ROSTER_GROUP} is not configured` })
  await sql.transaction([
    setActor(sql, `portal:${v.personId}`),
    sql`
      INSERT INTO join_requests (person_id, group_id, source, status, invited_by, internal_notes)
      SELECT ${personId}, ${group.id}, 'manual', 'pending', ${v.personId},
        'Admission vote started in the member portal; this application was created for it (hq 050).'
      WHERE NOT EXISTS (SELECT 1 FROM join_requests WHERE person_id = ${personId} AND status = 'pending')
    `,
  ])
  const [jr] = (await sql`
    SELECT jr.id, ng.slug FROM join_requests jr LEFT JOIN network_groups ng ON ng.id = jr.group_id
    WHERE jr.person_id = ${personId} AND jr.status = 'pending' ORDER BY jr.created_at DESC LIMIT 1
  `) as any[]
  if (!jr) throw createError({ statusCode: 409, message: 'No open application' })
  if (jr.slug && jr.slug !== ADMISSION_ROSTER_GROUP) {
    throw createError({ statusCode: 409, message: 'Admission votes are for the Norwegian forening only' })
  }

  const roster = await activeRoster()
  if (roster.length === 0) throw createError({ statusCode: 400, message: 'No active members to vote' })
  const opened = new Date()
  const closes = closesAtFrom(opened, days)
  try {
    const [, rows] = (await sql.transaction([
      setActor(sql, `portal:${v.personId}`),
      sql`
        INSERT INTO admission_votes (join_request_id, group_id, roster_group, roster, roster_sha256,
          candidate_name, board_note, opened_by, opened_at, closes_at)
        VALUES (${jr.id}, ${group.id}, ${ADMISSION_ROSTER_GROUP}, ${JSON.stringify(roster)}::jsonb, ${rosterSha(roster)},
          ${person.name}, ${note || null}, ${v.personId}, ${opened.toISOString()}, ${closes.toISOString()})
        RETURNING id
      `,
    ])) as [unknown, any[]]
    return { id: rows[0].id as string }
  } catch (err: any) {
    if (err?.code === '23505')
      throw createError({ statusCode: 409, message: 'A vote on this application is already running' })
    throw err
  }
}

// -------------------------------------------------------------------- close, count

/** Count a vote and store the result, once. `by` null = closed by its window. */
async function closeVote(id: string, by: string | null) {
  const sql = useDatabase()
  // Shut the window first: from here the trigger refuses new ballots.
  await sql`
    UPDATE admission_votes SET closes_at = LEAST(closes_at, clock_timestamp())
    WHERE id = ${id} AND closed_at IS NULL AND cancelled_at IS NULL AND closes_at > clock_timestamp()
  `
  const [v] = (await sql`
    SELECT v.roster, v.join_request_id,
      COALESCE((SELECT array_agg(person_id::text) FROM admission_ballot_receipts WHERE vote_id = v.id), '{}') AS receipts,
      COALESCE((SELECT array_agg(choice) FROM admission_secret_ballots WHERE vote_id = v.id), '{}') AS choices
    FROM admission_votes v WHERE v.id = ${id} AND v.closed_at IS NULL AND v.cancelled_at IS NULL
  `) as any[]
  if (!v) return false
  const rosterIds = (v.roster as any[]).map((r) => r.person_id)
  const { counts, decision } = countAdmission(rosterIds, v.receipts, v.choices)
  const jrStatus = joinRequestStatusAfter(decision.outcome, null)
  const [, landed] = (await sql.transaction([
    setActor(sql, by ? `portal:${by}` : 'portal:admission-window'),
    sql`
      UPDATE admission_votes
      SET closed_at = NOW(), closed_by = ${by}, yes = ${counts.yes}, no = ${counts.no}, blank = ${counts.blank},
        result = ${decision.outcome}
      WHERE id = ${id} AND closed_at IS NULL AND cancelled_at IS NULL
      RETURNING id
    `,
    sql`
      UPDATE join_requests SET status = ${jrStatus}, resolved_at = NOW()
      WHERE id = ${v.join_request_id} AND status = 'pending' AND ${jrStatus} <> 'pending'
        AND EXISTS (SELECT 1 FROM admission_votes WHERE id = ${id} AND closed_at IS NOT NULL)
    `,
  ])) as [unknown, any[], unknown]
  return landed.length > 0
}

/** Count every vote whose window has passed. Cheap when there is none. */
export async function finalizeDue() {
  const sql = useDatabase()
  const due = (await sql`
    SELECT id FROM admission_votes WHERE closed_at IS NULL AND cancelled_at IS NULL AND closes_at <= NOW()
  `) as any[]
  for (const d of due) await closeVote(d.id, null)
}

export async function closeAdmissionVoteNow(v: AdmissionViewer, id: string | undefined) {
  requireBoardViewer(v)
  if (!id || !UUID.test(id)) throw createError({ statusCode: 404, message: 'No such vote' })
  if (!(await closeVote(id, v.personId))) throw createError({ statusCode: 409, message: 'The vote is not running' })
  return getAdmissionVote(v, id)
}

export async function cancelAdmissionVote(v: AdmissionViewer, id: string | undefined) {
  requireBoardViewer(v)
  if (!id || !UUID.test(id)) throw createError({ statusCode: 404, message: 'No such vote' })
  const sql = useDatabase()
  const [, rows] = (await sql.transaction([
    setActor(sql, `portal:${v.personId}`),
    sql`
      UPDATE admission_votes SET cancelled_at = NOW(), cancelled_by = ${v.personId}
      WHERE id = ${id} AND closed_at IS NULL AND cancelled_at IS NULL RETURNING id
    `,
  ])) as [unknown, any[]]
  if (!rows.length) throw createError({ statusCode: 409, message: 'The vote is not running' })
  return getAdmissionVote(v, id)
}

/** § 5.5: a tie is settled by lots. The board draws outside the portal and records it here, once. */
export async function recordAdmissionLot(v: AdmissionViewer, id: string | undefined, body: Record<string, unknown>) {
  requireBoardViewer(v)
  if (!id || !UUID.test(id)) throw createError({ statusCode: 404, message: 'No such vote' })
  const outcome = body.outcome
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : ''
  if (outcome !== 'passed' && outcome !== 'failed')
    throw createError({ statusCode: 400, message: 'outcome must be passed or failed' })
  if (!note) throw createError({ statusCode: 400, message: 'Say how the lot was drawn' })
  const jrStatus = joinRequestStatusAfter('tie', outcome)
  const sql = useDatabase()
  const [, rows] = (await sql.transaction([
    setActor(sql, `portal:${v.personId}`),
    sql`
      UPDATE admission_votes SET lot_outcome = ${outcome}, lot_by = ${v.personId}, lot_note = ${note}
      WHERE id = ${id} AND result = 'tie' AND lot_outcome IS NULL RETURNING join_request_id
    `,
    sql`
      UPDATE join_requests SET status = ${jrStatus}, resolved_at = NOW()
      WHERE status = 'pending' AND id = (SELECT join_request_id FROM admission_votes WHERE id = ${id} AND lot_outcome IS NOT NULL)
    `,
  ])) as [unknown, any[], unknown]
  if (!rows.length) throw createError({ statusCode: 409, message: 'No tie waiting for a lot' })
  return getAdmissionVote(v, id)
}

// -------------------------------------------------------------------- vote

export async function castAdmissionBallot(v: AdmissionViewer, id: string | undefined, choice: unknown) {
  if (!isMeetingChoice(choice)) throw createError({ statusCode: 400, message: 'choice must be yes, no or blank' })
  const vote = await loadVote(id)
  if (!vote) throw createError({ statusCode: 404, message: 'No such vote' })
  const onRoster = (vote.roster as any[]).some((r) => r.person_id === v.personId)
  if (!onRoster) throw createError({ statusCode: 403, message: 'You are not on the roster for this vote' })
  if (voteState(vote, new Date()) !== 'open') throw createError({ statusCode: 409, message: 'The vote is closed' })
  const sql = useDatabase()
  try {
    await sql.transaction([
      sql`INSERT INTO admission_ballot_receipts (vote_id, person_id) VALUES (${vote.id}, ${v.personId})`,
      sql`INSERT INTO admission_secret_ballots (vote_id, choice) VALUES (${vote.id}, ${choice})`,
    ])
  } catch (err: any) {
    if (err?.code === '23505') throw createError({ statusCode: 409, message: 'You have already voted' })
    if (err?.code === '23514') throw createError({ statusCode: 409, message: 'The vote is closed' })
    throw err
  }
  return getAdmissionVote(v, vote.id)
}

async function loadVote(id: string | undefined) {
  if (!id || !UUID.test(id)) return null
  const sql = useDatabase()
  const rows = (await sql`
    SELECT av.*, ob.name AS opened_by_name, cb.name AS closed_by_name, lb.name AS lot_by_name,
      jr.why_join, jr.person_id AS candidate_id, jr.status AS join_status, inv.name AS invited_by,
      (SELECT count(*)::int FROM admission_ballot_receipts r WHERE r.vote_id = av.id) AS turnout
    FROM admission_votes av
    JOIN join_requests jr ON jr.id = av.join_request_id
    LEFT JOIN persons ob ON ob.id = av.opened_by
    LEFT JOIN persons cb ON cb.id = av.closed_by
    LEFT JOIN persons lb ON lb.id = av.lot_by
    LEFT JOIN persons inv ON inv.id = jr.invited_by
    WHERE av.id = ${id}
  `) as any[]
  return rows[0] ?? null
}

function summary(vote: any, v: AdmissionViewer, voted: boolean, now: Date) {
  const state = voteState(vote, now)
  const rosterSize = (vote.roster as any[]).length
  const closed = state === 'closed'
  const cast = closed ? vote.yes + vote.no : null
  return {
    id: vote.id as string,
    candidateName: vote.candidate_name as string,
    state,
    openedAt: vote.opened_at as string,
    closesAt: vote.closes_at as string,
    closedAt: vote.closed_at as string | null,
    onRoster: (vote.roster as any[]).some((r) => r.person_id === v.personId),
    hasVoted: voted,
    turnout: { voted: vote.turnout as number, roster: rosterSize },
    // Counts only once it is closed: nobody sees which way it is going while it runs.
    result: closed
      ? {
          yes: vote.yes as number,
          no: vote.no as number,
          blank: vote.blank as number,
          outcome: vote.result as string,
          needed: neededFor(cast ?? 0, ADMISSION_RULES.preset),
          lot: vote.lot_outcome
            ? { outcome: vote.lot_outcome as string, note: vote.lot_note, by: vote.lot_by_name }
            : null,
        }
      : null,
  }
}

async function hasVotedOn(personId: string, voteIds: string[]) {
  if (!voteIds.length) return new Set<string>()
  const sql = useDatabase()
  const rows = (await sql`
    SELECT vote_id FROM admission_ballot_receipts WHERE person_id = ${personId} AND vote_id = ANY(${voteIds})
  `) as any[]
  return new Set(rows.map((r) => r.vote_id as string))
}

/** The votes this viewer may see: the board every one, a member those they are on the roster of. */
export async function listAdmissionVotes(v: AdmissionViewer) {
  await finalizeDue()
  const sql = useDatabase()
  const rows = (await sql`
    SELECT av.*, (SELECT count(*)::int FROM admission_ballot_receipts r WHERE r.vote_id = av.id) AS turnout
    FROM admission_votes av
    WHERE ${v.isBoard} OR av.roster @> ${JSON.stringify([{ person_id: v.personId }])}::jsonb
    ORDER BY (av.closed_at IS NULL AND av.cancelled_at IS NULL) DESC, av.opened_at DESC
    LIMIT 100
  `) as any[]
  const voted = await hasVotedOn(
    v.personId,
    rows.map((r) => r.id),
  )
  const now = new Date()
  return rows.map((r) => summary(r, v, voted.has(r.id), now))
}

/** One vote, with the candidate as the members see them. 404 for anyone not on the roster or the board. */
export async function getAdmissionVote(v: AdmissionViewer, id: string | undefined) {
  await finalizeDue()
  const vote = await loadVote(id)
  const onRoster = vote && (vote.roster as any[]).some((r) => r.person_id === v.personId)
  if (!vote || (!onRoster && !v.isBoard)) throw createError({ statusCode: 404, message: 'No such vote' })
  const sql = useDatabase()
  const [c] =
    (await sql`SELECT p.id, ${candidateFields(sql)} FROM persons p WHERE p.id = ${vote.candidate_id}`) as any[]
  const voted = await hasVotedOn(v.personId, [vote.id])
  return {
    ...summary(vote, v, voted.has(vote.id), new Date()),
    candidate: {
      name: vote.candidate_name as string,
      linkedin: (c?.linkedin as string | null) ?? null,
      org: (c?.org as string | null) ?? null,
      roleTitle: (c?.role_title as string | null) ?? null,
      whyJoin: vote.why_join as string | null,
      invitedBy: vote.invited_by as string | null,
    },
    boardNote: vote.board_note as string | null,
    openedBy: vote.opened_by_name as string,
    cancelledAt: vote.cancelled_at as string | null,
    rule: ADMISSION_RULES,
    board: v.isBoard
      ? { closedBy: vote.closed_by_name as string | null, joinStatus: vote.join_status as string }
      : null,
  }
}
