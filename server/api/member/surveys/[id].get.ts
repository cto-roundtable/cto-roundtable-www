// GET /api/member/surveys/:id
// One survey with the caller's own answer. Members see it when they are in the
// event's group and it is not a draft; anyone else gets a 404, as if it did not
// exist. The board always sees it, plus the response count.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const id = surveyIdParam(event)
  const survey = await loadSurvey(id)
  if (!survey) throw createError({ statusCode: 404, message: 'Survey not found' })

  const [isBoard, eligible] = await Promise.all([
    isBoardMember(session.personId),
    isEligibleForSurvey(session.personId, survey),
  ])
  if (!isBoard && (!eligible || survey.status === 'draft')) {
    throw createError({ statusCode: 404, message: 'Survey not found' })
  }

  const [own, responseCount] = await Promise.all([
    loadOwnResponse(id, session.personId),
    isBoard ? countSurveyResponses(id) : Promise.resolve(null),
  ])
  const isOpen = isOpenForAnswers(survey)

  return {
    id: survey.id,
    title: survey.title,
    intro: survey.intro,
    status: survey.status,
    isOpen,
    closesAt: survey.closesAt,
    lang: survey.lang,
    event: {
      id: survey.eventId,
      date: survey.eventDate,
      theme: survey.eventTheme,
      location: survey.eventLocation,
      groupSlug: survey.groupSlug,
    },
    questions: survey.questions,
    eligible,
    canAnswer: eligible && isOpen,
    isBoard,
    responseCount,
    myAnswers: own?.answers ?? null,
    mySubmittedAt: own?.submittedAt ?? null,
    myUpdatedAt: own?.updatedAt ?? null,
  }
})
