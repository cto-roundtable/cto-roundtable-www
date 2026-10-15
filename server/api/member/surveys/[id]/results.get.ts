// GET /api/member/surveys/:id/results
// Board: everything, text answers with names (a small, trusted circle; the page
// says so). A respondent, once they have answered: aggregates only, no names and
// no free text. Everyone else: 403 (or 404 when they cannot see the survey at all).
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const id = surveyIdParam(event)
  const survey = await loadSurvey(id)
  if (!survey) throw createError({ statusCode: 404, message: 'Survey not found' })

  const isBoard = await isBoardMember(session.personId)
  const sql = useDatabase()
  if (!isBoard) {
    const eligible = await isEligibleForSurvey(session.personId, survey)
    if (!eligible || survey.status === 'draft') throw createError({ statusCode: 404, message: 'Survey not found' })
    const own = await sql`
      SELECT 1 FROM event_survey_responses
      WHERE survey_id = ${id} AND person_id = ${session.personId}
      LIMIT 1
    `
    if (own.length === 0) {
      throw createError({
        statusCode: 403,
        message:
          survey.lang === 'en'
            ? 'Answer the survey to see the results.'
            : 'Svar på undersøkelsen for å se resultatene.',
      })
    }
  }

  const rows = await sql`
    SELECT p.name, r.answers, r.updated_at
    FROM event_survey_responses r
    JOIN persons p ON p.id = r.person_id
    WHERE r.survey_id = ${id}
    ORDER BY r.submitted_at
  `
  const responses = rows.map((r: any) => ({ name: r.name, answers: r.answers }))

  return {
    id: survey.id,
    title: survey.title,
    status: survey.status,
    isOpen: isOpenForAnswers(survey),
    closesAt: survey.closesAt,
    lang: survey.lang,
    event: { id: survey.eventId, date: survey.eventDate, theme: survey.eventTheme, location: survey.eventLocation },
    full: isBoard,
    responseCount: responses.length,
    questions: aggregateResponses(survey.questions, responses, isBoard),
  }
})
