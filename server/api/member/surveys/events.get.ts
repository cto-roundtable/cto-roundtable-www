// GET /api/member/surveys/events
// Board only: the event picker for "Ny undersøkelse", plus both default templates.
export default defineEventHandler(async (event) => {
  await requireBoard(event)
  return {
    events: await listSurveyEvents(15),
    templates: { nb: defaultQuestions('nb'), en: defaultQuestions('en') },
  }
})
