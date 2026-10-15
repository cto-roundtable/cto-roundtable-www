// POST /api/member/surveys/:id/response
// Save the caller's answer, or replace it while the survey is still open. Body:
// { answers: { <question id>: number | string | string[] } }, validated against
// the survey's questions (server/utils/surveys.ts validateAnswers).
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const id = surveyIdParam(event)
  const survey = await loadSurvey(id)
  if (!survey) throw createError({ statusCode: 404, message: 'Survey not found' })

  const eligible = await isEligibleForSurvey(session.personId, survey)
  if (!eligible) throw createError({ statusCode: 404, message: 'Survey not found' })
  if (!isOpenForAnswers(survey)) {
    throw createError({
      statusCode: 409,
      message: survey.lang === 'en' ? 'This survey is closed.' : 'Undersøkelsen er lukket.',
    })
  }

  const body = (await readBody<{ answers?: unknown }>(event)) ?? {}
  const answers = validateAnswers(survey.questions, body.answers, survey.lang)

  const sql = useDatabase()
  const rows = await sql`
    INSERT INTO event_survey_responses (survey_id, person_id, answers)
    VALUES (${id}, ${session.personId}, ${JSON.stringify(answers)}::jsonb)
    ON CONFLICT (survey_id, person_id)
    DO UPDATE SET answers = EXCLUDED.answers, updated_at = NOW()
    RETURNING submitted_at, updated_at
  `
  return { ok: true, submittedAt: rows[0]!.submitted_at, updatedAt: rows[0]!.updated_at }
})
