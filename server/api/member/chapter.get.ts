// GET /api/member/chapter
// The member's chapters and the evenings of those chapters, for the Swedish
// area (/member/sweden) and anything else that is per chapter. An event belongs
// to a chapter through events.group_id. Upcoming first (soonest first), then
// the last few past ones (newest first).
export default defineEventHandler(async (event) => {
  const chapters: Chapter[] = event.context.chapters ?? []
  const slugs = chapterGroupSlugs(chapters)
  const sql = useDatabase()

  const rows = await sql`
    (
      SELECT e.id, e.date, e.theme, e.location, e.luma_url, ng.slug, true AS upcoming
      FROM events e
      JOIN network_groups ng ON ng.id = e.group_id
      WHERE ng.slug = ANY(${slugs}) AND e.date >= CURRENT_DATE
      ORDER BY e.date ASC
      LIMIT 5
    )
    UNION ALL
    (
      SELECT e.id, e.date, e.theme, e.location, e.luma_url, ng.slug, false AS upcoming
      FROM events e
      JOIN network_groups ng ON ng.id = e.group_id
      WHERE ng.slug = ANY(${slugs}) AND e.date < CURRENT_DATE
      ORDER BY e.date DESC
      LIMIT 5
    )
  `

  const toEvent = (r: any) => ({
    id: r.id,
    date: r.date,
    theme: r.theme,
    location: r.location,
    lumaUrl: r.luma_url,
    chapter: chapterOfSlug(r.slug),
  })

  return {
    chapters,
    upcoming: rows.filter((r: any) => r.upcoming).map(toEvent),
    past: rows.filter((r: any) => !r.upcoming).map(toEvent),
  }
})
