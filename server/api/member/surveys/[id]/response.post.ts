// POST /api/member/surveys/:id/response
// Save the caller's answer, or replace it while the survey is still open. Body:
// { answers: { <question id>: number | string | string[] } }, validated against
// the survey's questions (saveSurveyResponse in server/utils/surveys.ts).
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const id = surveyIdParam(event)
  const survey = await loadSurvey(id)
  if (!survey) throw createError({ statusCode: 404, message: 'Survey not found' })

  const eligible = await isEligibleForSurvey(session.personId, survey)
  if (!eligible) {
    // The board can see every survey, so it gets the real reason; anyone else
    // learns nothing about a survey they cannot see.
    if (!(await isBoardMember(session.personId))) throw createError({ statusCode: 404, message: 'Survey not found' })
    throw createError({
      statusCode: 403,
      message:
        survey.lang === 'en' ? 'Only those who attended can answer.' : 'Bare de som var på arrangementet kan svare.',
    })
  }
  if (!isOpenForAnswers(survey)) {
    throw createError({
      statusCode: 409,
      message: survey.lang === 'en' ? 'This survey is closed.' : 'Undersøkelsen er lukket.',
    })
  }

  const body = (await readBody<{ answers?: unknown }>(event)) ?? {}
  const saved = await saveSurveyResponse(survey, session.personId, body.answers)
  return { ok: true, ...saved }
})
