// POST /api/admin/events/import[?dryRun=1]
// One finished Luma event in: the events row and its attendance. The daily box
// job `ctr events import-luma` posts every event that ended in the window, so
// events and attendance stop depending on someone typing them in.
//
// Body: { lumaEventId, name, startAt, endAt?, location?, url?, calendarId,
//         hosts: [{email, name?}], attendees: [{email, name?}] }
//
// - events: upserted on luma_event_id (unique since hq 028). Luma owns date
//   (the Oslo date of startAt), group (from the calendar) and luma_url; theme and
//   location are only filled when empty, so a hand-edited row keeps its words.
// - activity_events: event_hosted per host, event_attended per attendee, with the
//   track-event-attendance dedup keys (luma:hosted|attended:<evt>:<email>), so
//   the skill and this import never double-count. Members are resolved by email.
//   Attendees are the people Luma approved: QR check-in is almost never used,
//   so approved at a finished event is the attendance signal (house convention).
// - Only finished events (422 otherwise), only the two network calendars (422).
// The audit row holds counts, never emails or names.
import type { ActivitySignal } from '../../../utils/activity'

/** Luma calendar -> network_groups.slug. Any other calendar is refused. */
const CALENDAR_GROUPS: Record<string, string> = {
  'cal-dmo5G7th5RBVJBa': 'cto-roundtable',
  'cal-hVE8T9IUvyA2Dk1': 'roundtable-sweden',
}
const LUMA_EVENT_RE = /^evt-[A-Za-z0-9]{6,40}$/
const LUMA_SLUG_RE = /^[A-Za-z0-9-]{1,100}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_PEOPLE = 1000

interface LumaPerson {
  email: string
  name: string | null
}

function bad(message: string, statusCode = 400): never {
  throw createError({ statusCode, message })
}

function text(input: unknown, field: string, max: number, required = false): string | null {
  if (input === undefined || input === null || input === '') {
    if (required) bad(`${field} is required`)
    return null
  }
  if (typeof input !== 'string') bad(`${field} must be a string`)
  const s = input.trim()
  if (s.length > max) bad(`${field} is longer than ${max} characters`)
  if (!s && required) bad(`${field} is required`)
  return s || null
}

function timestamp(input: unknown, field: string, required = false): Date | null {
  if (input === undefined || input === null || input === '') {
    if (required) bad(`${field} is required`)
    return null
  }
  if (typeof input !== 'string' || Number.isNaN(Date.parse(input))) bad(`${field} must be an ISO timestamp`)
  return new Date(input)
}

/** Lowercased, deduplicated by email. */
function people(input: unknown, field: string): LumaPerson[] {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) bad(`${field} must be an array`)
  if (input.length > MAX_PEOPLE) bad(`${field} has more than ${MAX_PEOPLE} entries`)
  const byEmail = new Map<string, LumaPerson>()
  input.forEach((p: any, i: number) => {
    const email = typeof p?.email === 'string' ? p.email.trim().toLowerCase() : ''
    if (email.length > 320 || !EMAIL_RE.test(email)) bad(`${field}[${i}].email is not an email address`)
    const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 200) : null
    if (!byEmail.has(email)) byEmail.set(email, { email, name })
  })
  return [...byEmail.values()]
}

function lumaUrl(input: unknown): string | null {
  const s = text(input, 'url', 500)
  if (!s) return null
  if (/^https:\/\//.test(s)) return s
  if (LUMA_SLUG_RE.test(s)) return `https://lu.ma/${s}`
  bad('url must be an https URL or a Luma slug')
}

export default defineAdminRoute({
  POST: {
    scope: 'events:write',
    handler: async (event, _caller, audit) => {
      const dryRun = ['1', 'true'].includes(String(getQuery(event).dryRun))
      audit.summary.dryRun = dryRun
      const body = (await readBody(event)) ?? {}

      const lumaEventId = text(body.lumaEventId, 'lumaEventId', 64, true)!
      if (!LUMA_EVENT_RE.test(lumaEventId)) bad('lumaEventId must look like evt-...')
      audit.targetType = 'luma_event'
      audit.targetId = lumaEventId

      const calendarId = text(body.calendarId, 'calendarId', 64, true)!
      const groupSlug = CALENDAR_GROUPS[calendarId]
      if (!groupSlug) bad(`calendar ${calendarId} is not a network calendar`, 422)
      audit.summary.group = groupSlug

      const name = text(body.name, 'name', 300, true)!
      const location = text(body.location, 'location', 300)
      const url = lumaUrl(body.url)
      const startAt = timestamp(body.startAt, 'startAt', true)!
      const endAt = timestamp(body.endAt, 'endAt')
      if (endAt && endAt < startAt) bad('endAt is before startAt')
      if ((endAt ?? startAt).getTime() > Date.now()) bad('the event has not ended yet', 422)
      const hosts = people(body.hosts, 'hosts')
      const attendees = people(body.attendees, 'attendees')
      audit.summary.hosts = hosts.length
      audit.summary.attendees = attendees.length

      const date = startAt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' })
      const occurredAt = startAt.toISOString()
      const signals: ActivitySignal[] = [
        ...hosts.map((h) => ({
          source: 'luma',
          eventType: 'event_hosted',
          actorExternalId: h.email,
          channelId: lumaEventId,
          channelName: name,
          occurredAt,
          dedupKey: `luma:hosted:${lumaEventId}:${h.email}`,
          resolveBy: 'email' as const,
          payload: { host_name: h.name, role: 'host' },
        })),
        ...attendees.map((a) => ({
          source: 'luma',
          eventType: 'event_attended',
          actorExternalId: a.email,
          channelId: lumaEventId,
          channelName: name,
          occurredAt,
          dedupKey: `luma:attended:${lumaEventId}:${a.email}`,
          resolveBy: 'email' as const,
          payload: { guest_name: a.name, approval_status: 'approved' },
        })),
      ]
      const keys = signals.map((s) => s.dedupKey)

      const sql = useDatabase()
      const [groups, existingEvents, existingKeys] = await Promise.all([
        sql`SELECT id FROM network_groups WHERE slug = ${groupSlug} LIMIT 1`,
        sql`SELECT id FROM events WHERE luma_event_id = ${lumaEventId} LIMIT 1`,
        keys.length ? sql`SELECT dedup_key FROM activity_events WHERE dedup_key = ANY(${keys})` : Promise.resolve([]),
      ])
      const groupId = (groups[0] as any)?.id
      if (!groupId) bad(`group ${groupSlug} does not exist`, 422)
      const already = new Set(existingKeys.map((r: any) => r.dedup_key as string))

      let eventId: string | null = (existingEvents[0] as any)?.id ?? null
      const created = !eventId
      if (!dryRun) {
        const rows = await sql`
          INSERT INTO events (group_id, date, theme, location, luma_event_id, luma_url)
          VALUES (${groupId}, ${date}, ${name}, ${location}, ${lumaEventId}, ${url})
          ON CONFLICT (luma_event_id) WHERE luma_event_id IS NOT NULL DO UPDATE SET
            group_id = EXCLUDED.group_id,
            date = EXCLUDED.date,
            luma_url = COALESCE(EXCLUDED.luma_url, events.luma_url),
            theme = COALESCE(events.theme, EXCLUDED.theme),
            location = COALESCE(events.location, EXCLUDED.location),
            updated_at = NOW()
          RETURNING id
        `
        eventId = (rows[0] as any).id
        audit.targetType = 'event'
        audit.targetId = eventId
        // Ten at a time: each is one round trip, and an event has tens of guests.
        for (let i = 0; i < signals.length; i += 10) {
          await Promise.all(signals.slice(i, i + 10).map((s) => recordActivity(sql, s)))
        }
      }
      audit.summary.created = created
      audit.summary.lumaEventId = lumaEventId

      // Who has no member behind their Luma email, so someone can add it to
      // contact_infos. On a real run this reads the stored rows (an earlier
      // unresolved row is not re-resolved by a re-run; ON CONFLICT DO NOTHING).
      const resolved = new Set<string>()
      if (!dryRun && keys.length) {
        const rows =
          await sql`SELECT dedup_key FROM activity_events WHERE dedup_key = ANY(${keys}) AND person_id IS NOT NULL`
        for (const r of rows as any[]) resolved.add(r.dedup_key)
      } else if (keys.length) {
        const emails = [...new Set(signals.map((s) => s.actorExternalId!))]
        const rows = await sql`
          SELECT DISTINCT lower(value) AS email FROM contact_infos
          WHERE type = 'email' AND lower(value) = ANY(${emails})
        `
        const known = new Set(rows.map((r: any) => r.email as string))
        for (const s of signals) if (known.has(s.actorExternalId!)) resolved.add(s.dedupKey)
      }
      const unresolved = signals
        .filter((s) => !resolved.has(s.dedupKey))
        .map((s) => ({
          role: s.eventType === 'event_hosted' ? 'host' : 'attendee',
          email: s.actorExternalId,
          name: (s.payload?.host_name ?? s.payload?.guest_name ?? null) as string | null,
        }))

      const recorded = keys.filter((k) => !already.has(k)).length
      audit.summary.recorded = recorded
      audit.summary.unresolved = unresolved.length

      return {
        dryRun,
        event: { id: eventId, lumaEventId, date, group: groupSlug, created },
        hosts: hosts.length,
        attendees: attendees.length,
        recorded,
        existing: keys.length - recorded,
        unresolved,
      }
    },
  },
})
