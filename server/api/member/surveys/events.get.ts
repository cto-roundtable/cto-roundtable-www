// GET /api/member/surveys/events
// Board only: the event picker for "Ny undersøkelse". The 15 most recent events
// up to today (a survey is about an event that happened), each with the title
// and language its survey would get, and the survey it already has, if any.
export default defineEventHandler(async (event) => {
  await requireBoard(event)
  const sql = useDatabase()

  const rows = await sql`
    SELECT e.id, to_char(e.date, 'YYYY-MM-DD') AS date, e.theme, e.location,
           ng.slug AS group_slug, ng.name AS group_name, s.id AS survey_id
    FROM events e
    LEFT JOIN network_groups ng ON ng.id = e.group_id
    LEFT JOIN event_surveys s ON s.event_id = e.id
    WHERE e.date IS NOT NULL AND e.date <= CURRENT_DATE
    ORDER BY e.date DESC
    LIMIT 15
  `

  return {
    events: rows.map((r: any) => {
      const lang = surveyLang(r.group_slug)
      return {
        id: r.id,
        date: r.date,
        theme: r.theme,
        location: r.location,
        group: r.group_name,
        lang,
        defaultTitle: defaultTitle(r.theme, lang),
        surveyId: r.survey_id,
      }
    }),
    templates: { nb: defaultQuestions('nb'), en: defaultQuestions('en') },
  }
})
