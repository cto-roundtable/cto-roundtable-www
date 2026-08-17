// GET /api/member/board/meetings/:slug
// Board-only (braintrust) single styremøte with its agenda and referat bodies.
export default defineEventHandler(async (event) => {
  await requireBoard(event)
  const sql = useDatabase()

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Missing slug' })
  }

  const rows = await sql`
    SELECT slug, number, meeting_date, starts_at, ends_at, title, location, status,
           agenda_md, minutes_md, source_path, synced_at
    FROM board_meetings
    WHERE slug = ${slug}
    LIMIT 1
  `
  const r = rows[0]
  if (!r) {
    throw createError({ statusCode: 404, message: 'Meeting not found' })
  }

  return {
    meeting: {
      slug: r.slug,
      number: Number(r.number),
      meetingDate: r.meeting_date,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      title: r.title,
      location: r.location,
      status: r.status,
      agendaMd: r.agenda_md,
      minutesMd: r.minutes_md,
      sourcePath: r.source_path,
      syncedAt: r.synced_at,
    },
  }
})
