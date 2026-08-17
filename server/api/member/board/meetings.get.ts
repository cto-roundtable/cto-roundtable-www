// GET /api/member/board/meetings
// Board-only (braintrust) list of styremøter, newest first.
//
// Metadata only — agenda and referat bodies are fetched per meeting so the list
// stays small and a body never leaks into a response the caller cannot open.
// `hasAgenda` / `hasMinutes` let the list show what exists without shipping it.
export default defineEventHandler(async (event) => {
  await requireBoard(event)
  const sql = useDatabase()

  const rows = await sql`
    SELECT slug, number, meeting_date, starts_at, ends_at, title, location, status,
           agenda_md IS NOT NULL  AS has_agenda,
           minutes_md IS NOT NULL AS has_minutes,
           synced_at
    FROM board_meetings
    ORDER BY meeting_date DESC
  `

  return {
    meetings: rows.map((r: any) => ({
      slug: r.slug,
      number: Number(r.number),
      meetingDate: r.meeting_date,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      title: r.title,
      location: r.location,
      status: r.status,
      hasAgenda: r.has_agenda,
      hasMinutes: r.has_minutes,
      syncedAt: r.synced_at,
    })),
  }
})
