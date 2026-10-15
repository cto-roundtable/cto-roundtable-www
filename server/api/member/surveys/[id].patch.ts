// PATCH /api/member/surveys/:id
// Board only: status, closesAt, title, intro, questions (updateSurvey in
// server/utils/surveys.ts; questions lock once someone has answered).
export default defineEventHandler(async (event) => {
  await requireBoard(event)
  const id = surveyIdParam(event)
  const body = (await readBody<SurveyPatch>(event)) ?? {}
  await updateSurvey(id, body)
  return { ok: true }
})
