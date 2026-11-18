import { eventLabel } from '../../utils/swedenEvents'

// Live numbers for the public /sweden page: how many CTOs the Stockholm chapter
// has, the evenings it has held and how many came, and the signups from the page.
// Public and read-only: counts, dates, host companies and themes. No names, no
// emails, no people.
//
// - members: active persons in the chapter group (roundtable-sweden). Snorre runs
//   the chapter from Oslo and is not in the group, so he is not counted.
// - evenings: `events` of the chapter group dated before today (Stockholm). Only
//   past ones: the page never names an upcoming date.
// - ctos per evening: chapter members with an `event_attended` or `event_hosted`
//   Luma row for it (the house convention: an approved guest counts as attended,
//   see server/utils/surveys.ts). Snorre's host row is not a chapter member's.
// - signups: join_requests to the group from the form, pending or accepted;
//   pool: the pending ones, not yet in.

const SWEDEN_GROUP_SLUG = 'roundtable-sweden'
const NORWAY_GROUP_SLUG = 'cto-roundtable'

export default defineCachedEventHandler(
  async () => {
    const sql = useDatabase()

    const [chapter] = await sql`
      SELECT count(*)::int AS members
      FROM memberships m
      JOIN network_groups ng ON ng.id = m.group_id
      JOIN persons p ON p.id = m.person_id
      WHERE ng.slug = ${SWEDEN_GROUP_SLUG} AND p.status = 'active'
    `

    const [signups] = await sql`
      SELECT
        count(*)::int AS signups,
        count(*) FILTER (WHERE jr.status = 'pending')::int AS pool,
        count(*) FILTER (WHERE jr.created_at > now() - interval '30 days')::int AS recent,
        to_char(min(jr.created_at) AT TIME ZONE 'Europe/Stockholm', 'YYYY-MM-DD') AS since
      FROM join_requests jr
      JOIN network_groups ng ON ng.id = jr.group_id
      WHERE ng.slug = ${SWEDEN_GROUP_SLUG}
        AND jr.status IN ('pending', 'accepted')
    `

    const events = await sql`
      SELECT
        to_char(e.date, 'YYYY-MM-DD') AS date,
        e.theme AS title,
        e.location,
        (SELECT count(DISTINCT a.person_id)::int
         FROM activity_events a
         JOIN memberships m ON m.person_id = a.person_id AND m.group_id = e.group_id
         WHERE a.source = 'luma'
           AND a.event_type IN ('event_attended', 'event_hosted')
           AND a.channel_id = e.luma_event_id) AS ctos
      FROM events e
      JOIN network_groups ng ON ng.id = e.group_id
      WHERE ng.slug = ${SWEDEN_GROUP_SLUG}
        AND e.date < (now() AT TIME ZONE 'Europe/Stockholm')::date
      ORDER BY e.date DESC
    `

    const [norway] = await sql`
      SELECT count(*)::int AS members
      FROM memberships m
      JOIN network_groups ng ON ng.id = m.group_id
      WHERE ng.slug = ${NORWAY_GROUP_SLUG}
    `

    return {
      members: chapter?.members ?? 0,
      signups: signups?.signups ?? 0,
      pool: signups?.pool ?? 0,
      recent: signups?.recent ?? 0,
      signupsSince: (signups?.since as string | null) ?? null,
      evenings: events.map((e) => ({
        date: e.date as string,
        ...eventLabel(e.title, e.location),
        ctos: e.ctos as number,
      })),
      norwayMembers: norway?.members ?? 0,
    }
  },
  { maxAge: 60, name: 'sweden-status', getKey: () => 'sweden-status' },
)
