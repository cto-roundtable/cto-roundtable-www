// Sweden admission votes (roundtable-sweden). Snorre 2026-11-22; hq migration 051 on top
// of 050. The Norwegian § 4.1 vote (server/utils/admission.ts) is a different thing and
// does not change: it keeps its board, its roster and its majority rule, and every query
// there is scoped to roster_group 'cto-roundtable'. Every query here is scoped to
// roster_group 'roundtable-sweden'.
//
//   - Who votes: the explicit list in admission_roles (role 'voter', current rows), the
//     founding members at the first Stockholm evening. Not every member, and NOT derived
//     from activity_events. Frozen into the vote's roster at open, with a sha256.
//   - Who runs it: admission_roles 'manager' (Snorre, Oliver), not styret. They see the
//     list of applicants, start a vote on one, close it early, cancel it, and read the notes.
//   - The ballot: yes / no / blank plus an optional note, secret and final. The receipt
//     (who) and the choice + note (what, no person, no timestamp) are written in one
//     transaction. Managers read the notes once the vote is closed, with the choice and
//     never the author; voters never see them.
//   - The rule: at least 2/3 of yes + no (swedenAdmissionRules.ts). No tie, so no lot.
//   - The application: the vote hangs off the applicant's pending join_request to
//     roundtable-sweden (no manual one is created here). Passed: 'accepted' + resolved_at;
//     the person stays a prospect until they are added as a member, as in Norway.
//     Failed or no votes: 'rejected'.
// Behind its own flag (requireSwedenAdmissions, NUXT_ADMISSIONS_SWEDEN_ENABLED).
// Nothing here sends mail or Slack.
import type { H3Event } from 'h3'
import { candidateFields, rosterSha } from './admission.ts'
import { closesAtFrom, joinRequestStatusAfter, voteState, windowDays } from './admissionRules.ts'
import {
  countSwedenAdmission,
  notesVisible,
  parseBallotNote,
  SWEDEN_ADMISSION_GROUP,
  SWEDEN_ADMISSION_RULES,
} from './swedenAdmissionRules.ts'
import { isMeetingChoice, neededFor } from './voteRules.ts'

const GROUP = SWEDEN_ADMISSION_GROUP
const UUID = /^[0-9a-f-]{36}$/i

export interface SwedenAdmissionViewer {
  personId: string
  /** a current Sweden manager (admission_roles) */
  isManager: boolean
  /** on Sweden's current voter list (admission_roles) */
  isVoter: boolean
}

/** The viewer's current Sweden roles. Cheap: one indexed query. Also used by /api/auth/session. */
export async function swedenAdmissionRoles(personId: string): Promise<{ isManager: boolean; isVoter: boolean }> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT r.role FROM admission_roles r JOIN network_groups ng ON ng.id = r.group_id
    WHERE r.person_id = ${personId} AND ng.slug = ${GROUP} AND r.valid_to IS NULL
  `) as { role: string }[]
  const roles = new Set(rows.map((r) => r.role))
  return { isManager: roles.has('manager'), isVoter: roles.has('voter') }
}

export async function swedenAdmissionViewer(event: H3Event): Promise<SwedenAdmissionViewer> {
  const session = event.context.session
  if (!session?.personId) throw createError({ statusCode: 401, message: 'Unauthorized' })
  return { personId: session.personId, ...(await swedenAdmissionRoles(session.personId)) }
}

function requireManager(v: SwedenAdmissionViewer) {
  if (!v.isManager) throw createError({ statusCode: 403, message: 'Sweden managers only' })
}

// -------------------------------------------------------------------- the lists

/** Sweden's current voters and managers, for the managers' page. */
export async function swedenRoleList(v: SwedenAdmissionViewer) {
  requireManager(v)
  const sql = useDatabase()
  const rows = (await sql`
    SELECT p.id, p.name, p.status, r.role, r.valid_from
    FROM admission_roles r JOIN network_groups ng ON ng.id = r.group_id JOIN persons p ON p.id = r.person_id
    WHERE ng.slug = ${GROUP} AND r.valid_to IS NULL
    ORDER BY r.role, p.name, p.id
  `) as any[]
  const pick = (role: string) =>
    rows
      .filter((r) => r.role === role)
      .map((r) => ({ personId: r.id as string, name: r.name as string, active: r.status === 'active' }))
  return { voters: pick('voter'), managers: pick('manager') }
}

/**
 * The managers' list: every pending application to roundtable-sweden from someone who is
 * not already in the group, oldest first, with the live Sweden vote if there is one.
 * Membership, not persons.status, decides: an applicant can be an 'active' person with
 * no membership at all (Arash Dabiri on 2026-11-22), and is still an applicant.
 */
export async function listSwedenCandidates(v: SwedenAdmissionViewer) {
  requireManager(v)
  await finalizeDueSweden()
  const sql = useDatabase()
  const rows = (await sql`
    SELECT p.id AS person_id, p.name, p.status AS person_status, jr.id AS join_request_id, jr.why_join,
      jr.source, jr.created_at AS applied_at, ${candidateFields(sql)},
      av.id AS vote_id, av.closes_at
    FROM join_requests jr
    JOIN network_groups ng ON ng.id = jr.group_id
    JOIN persons p ON p.id = jr.person_id
    LEFT JOIN admission_votes av ON av.join_request_id = jr.id AND av.closed_at IS NULL AND av.cancelled_at IS NULL
      AND av.roster_group = ${GROUP}
    WHERE ng.slug = ${GROUP} AND jr.status = 'pending'
      AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.person_id = p.id AND m.group_id = jr.group_id)
    ORDER BY jr.created_at, p.name
  `) as any[]
  return rows.map((r) => ({
    personId: r.person_id as string,
    name: r.name as string,
    joinRequestId: r.join_request_id as string,
    since: r.applied_at as string,
    source: r.source as string | null,
    whyJoin: r.why_join as string | null,
    linkedin: r.linkedin as string | null,
    org: r.org as string | null,
    roleTitle: r.role_title as string | null,
    // A pensjonist coming back is not a new member: the managers decide that themselves.
    rejoin: r.person_status === 'retired',
    votable: r.person_status !== 'retired' && !r.vote_id,
    liveVote: r.vote_id ? { id: r.vote_id as string, closesAt: r.closes_at as string } : null,
  }))
}

// -------------------------------------------------------------------- start a vote

/** The voters to freeze: current voter rows, active people only (a pensjonist drops off). */
async function voterRoster() {
  const sql = useDatabase()
  return (await sql`
    SELECT p.id AS person_id, p.name
    FROM admission_roles r JOIN network_groups ng ON ng.id = r.group_id JOIN persons p ON p.id = r.person_id
    WHERE ng.slug = ${GROUP} AND r.role = 'voter' AND r.valid_to IS NULL AND p.status = 'active'
    ORDER BY p.name, p.id
  `) as { person_id: string; name: string }[]
}

export async function startSwedenVote(v: SwedenAdmissionViewer, body: Record<string, unknown>) {
  requireManager(v)
  const joinRequestId = body.joinRequestId
  if (typeof joinRequestId !== 'string' || !UUID.test(joinRequestId)) {
    throw createError({ statusCode: 400, message: 'joinRequestId is required' })
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 4000) : ''
  const days = windowDays(body.days)
  const sql = useDatabase()
  const [jr] = (await sql`
    SELECT jr.id, jr.group_id, jr.status, p.name, p.status AS person_status,
      EXISTS (SELECT 1 FROM memberships m WHERE m.person_id = p.id AND m.group_id = jr.group_id) AS is_member
    FROM join_requests jr JOIN network_groups ng ON ng.id = jr.group_id JOIN persons p ON p.id = jr.person_id
    WHERE jr.id = ${joinRequestId} AND ng.slug = ${GROUP}
  `) as any[]
  if (!jr) throw createError({ statusCode: 404, message: 'No such Sweden application' })
  if (jr.status !== 'pending') throw createError({ statusCode: 409, message: 'The application is not pending' })
  if (jr.is_member) throw createError({ statusCode: 409, message: 'Already a member of the Stockholm chapter' })
  if (jr.person_status === 'retired') {
    throw createError({ statusCode: 409, message: 'A returning member is decided by the managers, not a vote' })
  }
  const roster = await voterRoster()
  if (roster.length === 0) throw createError({ statusCode: 400, message: 'Sweden has no voters on its list' })
  const opened = new Date()
  const closes = closesAtFrom(opened, days)
  try {
    const [, rows] = (await sql.transaction([
      setActor(sql, `portal:${v.personId}`),
      sql`
        INSERT INTO admission_votes (join_request_id, group_id, roster_group, roster, roster_sha256, preset,
          candidate_name, board_note, opened_by, opened_at, closes_at)
        VALUES (${jr.id}, ${jr.group_id}, ${GROUP}, ${JSON.stringify(roster)}::jsonb, ${rosterSha(roster)},
          ${SWEDEN_ADMISSION_RULES.preset}, ${jr.name}, ${note || null}, ${v.personId},
          ${opened.toISOString()}, ${closes.toISOString()})
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

/** Count a Sweden vote and store the result, once. `by` null = closed by its window. */
async function closeSwedenVote(id: string, by: string | null) {
  const sql = useDatabase()
  // Shut the window first: from here the 050 trigger refuses new ballots.
  await sql`
    UPDATE admission_votes SET closes_at = LEAST(closes_at, clock_timestamp())
    WHERE id = ${id} AND roster_group = ${GROUP} AND closed_at IS NULL AND cancelled_at IS NULL
      AND closes_at > clock_timestamp()
  `
  const [v] = (await sql`
    SELECT v.roster, v.join_request_id, v.preset,
      COALESCE((SELECT array_agg(person_id::text) FROM admission_ballot_receipts WHERE vote_id = v.id), '{}') AS receipts,
      COALESCE((SELECT array_agg(choice) FROM admission_secret_ballots WHERE vote_id = v.id), '{}') AS choices
    FROM admission_votes v
    WHERE v.id = ${id} AND v.roster_group = ${GROUP} AND v.closed_at IS NULL AND v.cancelled_at IS NULL
  `) as any[]
  if (!v) return false
  // The rule is the one frozen at open; a Sweden vote is never counted by any other.
  if (v.preset !== SWEDEN_ADMISSION_RULES.preset) throw new Error(`Sweden vote ${id} has preset ${v.preset}`)
  const rosterIds = (v.roster as any[]).map((r) => r.person_id)
  const { counts, decision } = countSwedenAdmission(rosterIds, v.receipts, v.choices)
  const jrStatus = joinRequestStatusAfter(decision.outcome, null)
  const [, landed] = (await sql.transaction([
    setActor(sql, by ? `portal:${by}` : 'portal:sweden-admission-window'),
    sql`
      UPDATE admission_votes
      SET closed_at = NOW(), closed_by = ${by}, yes = ${counts.yes}, no = ${counts.no}, blank = ${counts.blank},
        result = ${decision.outcome}
      WHERE id = ${id} AND roster_group = ${GROUP} AND closed_at IS NULL AND cancelled_at IS NULL
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

/** Count every Sweden vote whose window has passed. Cheap when there is none. */
export async function finalizeDueSweden() {
  const sql = useDatabase()
  const due = (await sql`
    SELECT id FROM admission_votes
    WHERE roster_group = ${GROUP} AND closed_at IS NULL AND cancelled_at IS NULL AND closes_at <= NOW()
  `) as any[]
  for (const d of due) await closeSwedenVote(d.id, null)
}

export async function closeSwedenVoteNow(v: SwedenAdmissionViewer, id: string | undefined) {
  requireManager(v)
  if (!id || !UUID.test(id)) throw createError({ statusCode: 404, message: 'No such vote' })
  if (!(await closeSwedenVote(id, v.personId)))
    throw createError({ statusCode: 409, message: 'The vote is not running' })
  return getSwedenVote(v, id)
}

export async function cancelSwedenVote(v: SwedenAdmissionViewer, id: string | undefined) {
  requireManager(v)
  if (!id || !UUID.test(id)) throw createError({ statusCode: 404, message: 'No such vote' })
  const sql = useDatabase()
  const [, rows] = (await sql.transaction([
    setActor(sql, `portal:${v.personId}`),
    sql`
      UPDATE admission_votes SET cancelled_at = NOW(), cancelled_by = ${v.personId}
      WHERE id = ${id} AND roster_group = ${GROUP} AND closed_at IS NULL AND cancelled_at IS NULL RETURNING id
    `,
  ])) as [unknown, any[]]
  if (!rows.length) throw createError({ statusCode: 409, message: 'The vote is not running' })
  return getSwedenVote(v, id)
}

// -------------------------------------------------------------------- vote

export async function castSwedenBallot(
  v: SwedenAdmissionViewer,
  id: string | undefined,
  body: Record<string, unknown>,
) {
  const choice = body.choice
  if (!isMeetingChoice(choice)) throw createError({ statusCode: 400, message: 'choice must be yes, no or blank' })
  const parsed = parseBallotNote(body.note)
  if (!parsed.ok) throw createError({ statusCode: 400, message: parsed.error })
  const vote = await loadVote(id)
  if (!vote) throw createError({ statusCode: 404, message: 'No such vote' })
  const onRoster = (vote.roster as any[]).some((r) => r.person_id === v.personId)
  if (!onRoster) throw createError({ statusCode: 403, message: 'You are not on the roster for this vote' })
  if (voteState(vote, new Date()) !== 'open') throw createError({ statusCode: 409, message: 'The vote is closed' })
  const sql = useDatabase()
  try {
    await sql.transaction([
      sql`INSERT INTO admission_ballot_receipts (vote_id, person_id) VALUES (${vote.id}, ${v.personId})`,
      sql`INSERT INTO admission_secret_ballots (vote_id, choice, note) VALUES (${vote.id}, ${choice}, ${parsed.note})`,
    ])
  } catch (err: any) {
    if (err?.code === '23505') throw createError({ statusCode: 409, message: 'You have already voted' })
    if (err?.code === '23514') throw createError({ statusCode: 409, message: 'The vote is closed' })
    throw err
  }
  return getSwedenVote(v, vote.id)
}

async function loadVote(id: string | undefined) {
  if (!id || !UUID.test(id)) return null
  const sql = useDatabase()
  const rows = (await sql`
    SELECT av.*, ob.name AS opened_by_name, cb.name AS closed_by_name,
      jr.why_join, jr.person_id AS candidate_id, jr.status AS join_status,
      (SELECT count(*)::int FROM admission_ballot_receipts r WHERE r.vote_id = av.id) AS turnout
    FROM admission_votes av
    JOIN join_requests jr ON jr.id = av.join_request_id
    LEFT JOIN persons ob ON ob.id = av.opened_by
    LEFT JOIN persons cb ON cb.id = av.closed_by
    WHERE av.id = ${id} AND av.roster_group = ${GROUP}
  `) as any[]
  return rows[0] ?? null
}

function summary(vote: any, v: SwedenAdmissionViewer, voted: boolean, now: Date) {
  const state = voteState(vote, now)
  const closed = state === 'closed'
  return {
    id: vote.id as string,
    candidateName: vote.candidate_name as string,
    state,
    openedAt: vote.opened_at as string,
    closesAt: vote.closes_at as string,
    closedAt: vote.closed_at as string | null,
    onRoster: (vote.roster as any[]).some((r) => r.person_id === v.personId),
    hasVoted: voted,
    turnout: { voted: vote.turnout as number, roster: (vote.roster as any[]).length },
    // Counts only once it is closed: nobody sees which way it is going while it runs.
    result: closed
      ? {
          yes: vote.yes as number,
          no: vote.no as number,
          blank: vote.blank as number,
          outcome: vote.result as string,
          needed: neededFor(vote.yes + vote.no, SWEDEN_ADMISSION_RULES.preset),
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

/** The Sweden votes this viewer may see: a manager every one, anyone else those they are on the roster of. */
export async function listSwedenVotes(v: SwedenAdmissionViewer) {
  await finalizeDueSweden()
  const sql = useDatabase()
  const rows = (await sql`
    SELECT av.*, (SELECT count(*)::int FROM admission_ballot_receipts r WHERE r.vote_id = av.id) AS turnout
    FROM admission_votes av
    WHERE av.roster_group = ${GROUP}
      AND (${v.isManager} OR av.roster @> ${JSON.stringify([{ person_id: v.personId }])}::jsonb)
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

/**
 * The notes of a vote, for a manager once it is closed: choice and text, no author, no
 * time. Ordered by the ballot's random id, so the order says nothing about who voted when.
 */
async function notesOf(voteId: string) {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT choice, note FROM admission_secret_ballots WHERE vote_id = ${voteId} AND note IS NOT NULL ORDER BY id
  `) as { choice: string; note: string }[]
  return rows.map((r) => ({ choice: r.choice, note: r.note }))
}

/** One Sweden vote. 404 for anyone not on its roster and not a manager. */
export async function getSwedenVote(v: SwedenAdmissionViewer, id: string | undefined) {
  await finalizeDueSweden()
  const vote = await loadVote(id)
  const onRoster = vote && (vote.roster as any[]).some((r) => r.person_id === v.personId)
  if (!vote || (!onRoster && !v.isManager)) throw createError({ statusCode: 404, message: 'No such vote' })
  const sql = useDatabase()
  const [c] =
    (await sql`SELECT p.id, ${candidateFields(sql)} FROM persons p WHERE p.id = ${vote.candidate_id}`) as any[]
  const voted = await hasVotedOn(v.personId, [vote.id])
  const base = summary(vote, v, voted.has(vote.id), new Date())
  return {
    ...base,
    candidate: {
      name: vote.candidate_name as string,
      linkedin: (c?.linkedin as string | null) ?? null,
      org: (c?.org as string | null) ?? null,
      roleTitle: (c?.role_title as string | null) ?? null,
      whyJoin: vote.why_join as string | null,
    },
    managerNote: vote.board_note as string | null,
    openedBy: vote.opened_by_name as string,
    cancelledAt: vote.cancelled_at as string | null,
    rule: SWEDEN_ADMISSION_RULES,
    manager: v.isManager
      ? {
          closedBy: vote.closed_by_name as string | null,
          joinStatus: vote.join_status as string,
          notes: notesVisible(v, base.state) ? await notesOf(vote.id) : null,
        }
      : null,
  }
}
