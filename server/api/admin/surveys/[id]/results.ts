// GET /api/admin/surveys/:id/results[?texts=1]
// Aggregates per question. Free-text answers with names only with ?texts=1:
// an agent asking for the numbers should not pull members' words into its
// context by default. The audit row says which one was asked for.
// `ctr surveys results [--texts]`.
export default defineAdminRoute({
  GET: {
    scope: 'surveys:read',
    handler: async (event, _caller, audit) => {
      const id = surveyIdParam(event)
      audit.targetType = 'survey'
      audit.targetId = id
      const withTexts = getQuery(event).texts === '1'
      audit.summary.texts = withTexts
      const survey = await loadSurvey(id)
      if (!survey) throw createError({ statusCode: 404, message: 'Survey not found' })
      const { responseCount, questions } = await loadSurveyResults(survey, withTexts)
      return {
        id: survey.id,
        title: survey.title,
        status: survey.status,
        isOpen: isOpenForAnswers(survey),
        closesAt: survey.closesAt,
        lang: survey.lang,
        event: { id: survey.eventId, date: survey.eventDate, theme: survey.eventTheme, location: survey.eventLocation },
        texts: withTexts,
        responseCount,
        questions,
      }
    },
  },
})
