export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()

  const rows = await sql`
    SELECT
      e.id, e.date, e.theme, e.location, e.luma_url,
      ng.name AS group_name,
      COALESCE(
        (SELECT array_agg(p2.name ORDER BY p2.name)
         FROM event_hosts eh2
         JOIN persons p2 ON p2.id = eh2.person_id
         WHERE eh2.event_id = e.id AND eh2.person_id <> ${session.personId}),
        ARRAY[]::text[]
      ) AS co_hosts
    FROM events e
    JOIN event_hosts eh ON eh.event_id = e.id
    LEFT JOIN network_groups ng ON ng.id = e.group_id
    WHERE eh.person_id = ${session.personId}
      AND e.date IS NOT NULL
      AND e.date < CURRENT_DATE
    ORDER BY e.date DESC
  `

  return rows.map((r: any) => ({
    id: r.id,
    date: r.date,
    theme: r.theme,
    location: r.location,
    lumaUrl: r.luma_url,
    groupName: r.group_name,
    coHosts: r.co_hosts || [],
  }))
})
