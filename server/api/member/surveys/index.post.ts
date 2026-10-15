// POST /api/member/surveys
// Board only: create the survey for an event (createSurvey in server/utils/surveys.ts).
export default defineEventHandler(async (event) => {
  const personId = await requireBoard(event)
  const body = (await readBody<CreateSurveyInput>(event)) ?? ({} as CreateSurveyInput)
  const { id } = await createSurvey(body, personId)
  return { ok: true, id }
})
