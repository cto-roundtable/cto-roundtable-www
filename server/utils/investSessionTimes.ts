// Finding a time for the online info session, Doodle style (ctori-4 item session-times,
// Snorre 2026-11-25: "set a couple of timings and share with those who are interested").
// Tables: invest_session_times and invest_session_time_picks (ctoroundtable-hq migration
// 052), on top of the sign-up in invest_session_signups (049, server/utils/investSessions.ts).
//
// Rules:
// - The investment committee (current-komite, never styret: isDocumentCommentReader, the
//   same gate as the committee page) adds candidate times, removes them, sets a link, and
//   marks at most one as chosen. Everyone else gets the 404 of a missing offering.
// - Every member who sees the offering sees the candidate times, and ticks every time that
//   works. Ticking signs them up (the invest_session_signups row is created in the same
//   transaction); the database refuses a pick without a sign-up, and undoing the sign-up
//   deletes the picks.
// - Once a time is chosen the ticks are over: members see that time (and its link), and a
//   change of ticks is a 409. The link of a time is shown to members only once it is chosen.
// - Writes only while the sign-up is open (sessionSignupOpen: interest, committing, or a
//   draft for the committee preview), and every write names its writer (setActor).
// - Times are entered and shown in Europe/Oslo; the database stores the instant.

import { sessionSignupOpen } from './investSessions.ts'

/** At most this many candidate times per offering: a handful, not a calendar. */
export const SESSION_TIMES_MAX = 12
export const SESSION_DURATION_MIN = 15
export const SESSION_DURATION_MAX = 240
export const SESSION_DURATION_DEFAULT = 60
export const MEETING_URL_MAX = 500

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

type Err = { error: string }

/** "2026-12-03T19:00" (Oslo wall time, as <input type="datetime-local"> gives it), checked to be a real date. */
export function parseLocalStart(raw: unknown): { startsAtLocal: string } | Err {
  if (typeof raw !== 'string') return { error: 'invest.sessionTimes.errors.start' }
  const m = LOCAL_DATETIME.exec(raw.trim())
  if (!m) return { error: 'invest.sessionTimes.errors.start' }
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number]
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi))
  const real =
    date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && h < 24 && mi < 60
  if (!real || y < 2000 || y > 2100) return { error: 'invest.sessionTimes.errors.start' }
  return { startsAtLocal: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` }
}

/** Minutes, a whole number from 15 to 240; missing means the default hour. */
export function parseDuration(raw: unknown): { durationMinutes: number } | Err {
  if (raw === undefined || raw === null || raw === '') return { durationMinutes: SESSION_DURATION_DEFAULT }
  const n = typeof raw === 'string' ? Number(raw) : raw
  if (typeof n !== 'number' || !Number.isInteger(n) || n < SESSION_DURATION_MIN || n > SESSION_DURATION_MAX)
    return { error: 'invest.sessionTimes.errors.duration' }
  return { durationMinutes: n }
}

/** An optional Meet/Teams link: https only, no spaces, at most 500. Empty is none. The database CHECKs the same. */
export function parseMeetingUrl(raw: unknown): { meetingUrl: string | null } | Err {
  if (raw === undefined || raw === null) return { meetingUrl: null }
  if (typeof raw !== 'string') return { error: 'invest.sessionTimes.errors.url' }
  const url = raw.trim()
  if (!url) return { meetingUrl: null }
  if (url.length > MEETING_URL_MAX || /\s/.test(url) || !url.startsWith('https://'))
    return { error: 'invest.sessionTimes.errors.url' }
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || !u.hostname) return { error: 'invest.sessionTimes.errors.url' }
  } catch {
    return { error: 'invest.sessionTimes.errors.url' }
  }
  return { meetingUrl: url }
}

export interface SessionTimeInput {
  startsAtLocal: string
  durationMinutes: number
  meetingUrl: string | null
}

/** The committee's new candidate time: { start, durationMinutes?, meetingUrl? }. */
export function parseSessionTimeInput(body: unknown): SessionTimeInput | Err {
  const b = (body ?? {}) as Record<string, unknown>
  const start = parseLocalStart(b.start)
  if ('error' in start) return start
  const duration = parseDuration(b.durationMinutes)
  if ('error' in duration) return duration
  const url = parseMeetingUrl(b.meetingUrl)
  if ('error' in url) return url
  return { ...start, ...duration, ...url }
}

/**
 * A member's ticks: { timeIds: string[] }, each a candidate time of this offering, no
 * duplicates. An empty list is "none works" and is allowed only for someone already signed
 * up (ticking is how you sign up; to leave, undo the sign-up).
 */
export function parsePicks(body: unknown, candidateIds: string[], signedUp: boolean): { timeIds: string[] } | Err {
  const raw = (body as { timeIds?: unknown } | null)?.timeIds
  if (!Array.isArray(raw) || raw.length > SESSION_TIMES_MAX) return { error: 'invest.sessionTimes.errors.picks' }
  const ids: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string' || !UUID.test(v)) return { error: 'invest.sessionTimes.errors.picks' }
    const id = v.toLowerCase()
    if (!candidateIds.includes(id)) return { error: 'invest.sessionTimes.errors.gone' }
    if (!ids.includes(id)) ids.push(id)
  }
  if (!ids.length && !signedUp) return { error: 'invest.sessionTimes.errors.pickOne' }
  return { timeIds: ids }
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

export interface SessionTimeRow {
  id: string
  startsAt: string
  durationMinutes: number
  meetingUrl: string | null
  chosen: boolean
}

/** What a member is shown of a candidate time: the link only on the chosen one. */
export interface MemberSessionTime {
  id: string
  startsAt: string
  durationMinutes: number
  chosen: boolean
  meetingUrl: string | null
}

export function memberView(times: SessionTimeRow[]): MemberSessionTime[] {
  return times.map((t) => ({
    id: t.id,
    startsAt: t.startsAt,
    durationMinutes: t.durationMinutes,
    chosen: t.chosen,
    meetingUrl: t.chosen ? t.meetingUrl : null,
  }))
}

export interface ManagerGateDeps {
  requireVisibleOffering: (
    personId: string,
    slug: string,
  ) => Promise<{ offering: { id: string; status: string }; preview: boolean }>
  isCommittee: (personId: string) => Promise<boolean>
}

/**
 * The offering, for a committee member who may set its times; for anyone else (a member,
 * the board alone) the 404 of a missing offering, the same answer as the committee page.
 */
export async function requireSessionTimeManager(
  personId: string,
  slug: string,
  deps: Partial<ManagerGateDeps> = {},
): Promise<{ offering: { id: string; status: string }; preview: boolean }> {
  const d: ManagerGateDeps = {
    requireVisibleOffering: (p, s) => requireVisibleOffering(p, s),
    isCommittee: (p) => isDocumentCommentReader(p),
    ...deps,
  }
  const visible = await d.requireVisibleOffering(personId, slug)
  if (!(await d.isCommittee(personId))) throw createError({ statusCode: 404, message: 'Not found' })
  return visible
}

// ---------------------------------------------------------------- database

function rowToTime(r: any): SessionTimeRow {
  return {
    id: r.id,
    startsAt: r.starts_at instanceof Date ? r.starts_at.toISOString() : r.starts_at,
    durationMinutes: Number(r.duration_minutes),
    meetingUrl: r.meeting_url ?? null,
    chosen: r.chosen_at !== null && r.chosen_at !== undefined,
  }
}

/** The candidate times of an offering, earliest first. */
export async function listSessionTimes(offeringId: string): Promise<SessionTimeRow[]> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT id, starts_at, duration_minutes, meeting_url, chosen_at
    FROM invest_session_times WHERE offering_id = ${offeringId}
    ORDER BY starts_at
  `) as any[]
  return rows.map(rowToTime)
}

/** The ids of the times this person ticked. */
export async function getMyPicks(offeringId: string, personId: string): Promise<string[]> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT p.time_id FROM invest_session_time_picks p
    JOIN invest_session_times t ON t.id = p.time_id
    WHERE p.offering_id = ${offeringId} AND p.person_id = ${personId}
    ORDER BY t.starts_at
  `) as any[]
  return rows.map((r) => r.time_id)
}

type OfferingRef = { id: string; status: string }

function requireOpen(status: string, preview: boolean) {
  if (!sessionSignupOpen(status, preview))
    throw createError({ statusCode: 409, message: 'invest.session.errors.closed' })
}

/**
 * Replace the member's ticks. Signs them up if they were not (same transaction, so a pick
 * never exists without a sign-up). Refused once a time is chosen.
 */
export async function savePicks(offering: OfferingRef, personId: string, body: unknown, preview: boolean) {
  requireOpen(offering.status, preview)
  const sql = useDatabase()
  const [times, signedUpRows] = await Promise.all([
    listSessionTimes(offering.id),
    sql`SELECT 1 FROM invest_session_signups WHERE offering_id = ${offering.id} AND person_id = ${personId}`,
  ])
  if (times.some((t) => t.chosen)) throw createError({ statusCode: 409, message: 'invest.sessionTimes.errors.chosen' })
  const parsed = parsePicks(
    body,
    times.map((t) => t.id),
    (signedUpRows as any[]).length > 0,
  )
  if ('error' in parsed) throw createError({ statusCode: 400, message: parsed.error })
  const ids = parsed.timeIds
  await sql.transaction([
    setActor(sql, `portal:${personId}`),
    sql`
      INSERT INTO invest_session_signups (offering_id, person_id, source)
      VALUES (${offering.id}, ${personId}, 'portal')
      ON CONFLICT (offering_id, person_id) DO NOTHING
    `,
    sql`
      DELETE FROM invest_session_time_picks
      WHERE offering_id = ${offering.id} AND person_id = ${personId} AND NOT (time_id = ANY(${ids}::uuid[]))
    `,
    // Only times that still exist and while none is chosen: a race with the committee loses quietly.
    sql`
      INSERT INTO invest_session_time_picks (time_id, offering_id, person_id)
      SELECT t.id, t.offering_id, ${personId}::uuid FROM invest_session_times t
      WHERE t.offering_id = ${offering.id} AND t.id = ANY(${ids}::uuid[])
        AND NOT EXISTS (SELECT 1 FROM invest_session_times c
                         WHERE c.offering_id = ${offering.id} AND c.chosen_at IS NOT NULL)
      ON CONFLICT (time_id, person_id) DO NOTHING
    `,
  ])
}

/** A new candidate time. 409 when it is in the past, a duplicate, or one too many. */
export async function addSessionTime(offering: OfferingRef, personId: string, body: unknown, preview: boolean) {
  requireOpen(offering.status, preview)
  const input = parseSessionTimeInput(body)
  if ('error' in input) throw createError({ statusCode: 400, message: input.error })
  const sql = useDatabase()
  const [check] = (await sql`
    SELECT (${input.startsAtLocal}::timestamp AT TIME ZONE 'Europe/Oslo') <= now() AS past,
           (SELECT count(*)::int FROM invest_session_times WHERE offering_id = ${offering.id}) AS n
  `) as any[]
  if (check.past) throw createError({ statusCode: 409, message: 'invest.sessionTimes.errors.past' })
  if (check.n >= SESSION_TIMES_MAX)
    throw createError({ statusCode: 409, message: 'invest.sessionTimes.errors.tooMany' })
  const result = (await sql.transaction([
    setActor(sql, `portal:${personId}`),
    sql`
      INSERT INTO invest_session_times (offering_id, starts_at, duration_minutes, meeting_url, created_by)
      VALUES (${offering.id}, (${input.startsAtLocal}::timestamp AT TIME ZONE 'Europe/Oslo'),
              ${input.durationMinutes}, ${input.meetingUrl}, ${personId})
      ON CONFLICT (offering_id, starts_at) DO NOTHING
      RETURNING id
    `,
  ])) as any[][]
  if (!result[1]?.length) throw createError({ statusCode: 409, message: 'invest.sessionTimes.errors.duplicate' })
  return result[1][0].id as string
}

async function requireTime(offeringId: string, timeId: string): Promise<SessionTimeRow> {
  if (!isUuid(timeId)) throw createError({ statusCode: 404, message: 'Not found' })
  const sql = useDatabase()
  const rows = (await sql`
    SELECT id, starts_at, duration_minutes, meeting_url, chosen_at
    FROM invest_session_times WHERE id = ${timeId} AND offering_id = ${offeringId}
  `) as any[]
  if (!rows[0]) throw createError({ statusCode: 404, message: 'Not found' })
  return rowToTime(rows[0])
}

/** Change the link and/or the length of a candidate time: { meetingUrl?, durationMinutes? }. */
export async function updateSessionTime(
  offering: OfferingRef,
  personId: string,
  timeId: string,
  body: unknown,
  preview: boolean,
) {
  requireOpen(offering.status, preview)
  const current = await requireTime(offering.id, timeId)
  const b = (body ?? {}) as Record<string, unknown>
  let meetingUrl = current.meetingUrl
  let durationMinutes = current.durationMinutes
  if ('meetingUrl' in b) {
    const u = parseMeetingUrl(b.meetingUrl)
    if ('error' in u) throw createError({ statusCode: 400, message: u.error })
    meetingUrl = u.meetingUrl
  }
  if ('durationMinutes' in b) {
    const d = parseDuration(b.durationMinutes)
    if ('error' in d) throw createError({ statusCode: 400, message: d.error })
    durationMinutes = d.durationMinutes
  }
  const sql = useDatabase()
  await sql.transaction([
    setActor(sql, `portal:${personId}`),
    sql`
      UPDATE invest_session_times SET meeting_url = ${meetingUrl}, duration_minutes = ${durationMinutes}
      WHERE id = ${timeId} AND offering_id = ${offering.id}
    `,
  ])
}

/** Remove a candidate time; its ticks go with it (ON DELETE CASCADE, audit_log keeps both). */
export async function removeSessionTime(offering: OfferingRef, personId: string, timeId: string, preview: boolean) {
  requireOpen(offering.status, preview)
  await requireTime(offering.id, timeId)
  const sql = useDatabase()
  await sql.transaction([
    setActor(sql, `portal:${personId}`),
    sql`DELETE FROM invest_session_times WHERE id = ${timeId} AND offering_id = ${offering.id}`,
  ])
}

/** Mark this time as THE time (any other chosen one is unmarked), or unmark it. */
export async function chooseSessionTime(
  offering: OfferingRef,
  personId: string,
  timeId: string,
  chosen: boolean,
  preview: boolean,
) {
  requireOpen(offering.status, preview)
  await requireTime(offering.id, timeId)
  const sql = useDatabase()
  if (chosen) {
    await sql.transaction([
      setActor(sql, `portal:${personId}`),
      sql`
        UPDATE invest_session_times SET chosen_at = NULL
        WHERE offering_id = ${offering.id} AND id <> ${timeId} AND chosen_at IS NOT NULL
      `,
      sql`
        UPDATE invest_session_times SET chosen_at = now()
        WHERE id = ${timeId} AND offering_id = ${offering.id} AND chosen_at IS NULL
      `,
    ])
  } else {
    await sql.transaction([
      setActor(sql, `portal:${personId}`),
      sql`
        UPDATE invest_session_times SET chosen_at = NULL
        WHERE id = ${timeId} AND offering_id = ${offering.id} AND chosen_at IS NOT NULL
      `,
    ])
  }
}

export interface CommitteeSessionTime extends SessionTimeRow {
  /** Who ticked this time, by name. */
  people: string[]
}

/** Every candidate time with the names of who can make it. Committee only: the caller checks. */
export async function listSessionTimesWithPeople(offeringId: string): Promise<CommitteeSessionTime[]> {
  const sql = useDatabase()
  const [times, picks] = await Promise.all([
    listSessionTimes(offeringId),
    sql`
      SELECT p.time_id, pe.name FROM invest_session_time_picks p
      JOIN persons pe ON pe.id = p.person_id
      WHERE p.offering_id = ${offeringId}
      ORDER BY pe.name
    ` as Promise<any[]>,
  ])
  return times.map((t) => ({ ...t, people: picks.filter((p) => p.time_id === t.id).map((p) => p.name) }))
}
