// GET /api/member/surveys/:id
// One survey with the caller's own answer. Members see it when they attended the
// event (and are in its group) and it is not a draft; anyone else gets a 404, as
// if it did not exist. The board always sees it, plus the response and attendee
// counts. ineligibleReason says why the caller cannot answer.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const id = surveyIdParam(event)
  const survey = await loadSurvey(id)
  if (!survey) throw createError({ statusCode: 404, message: 'Survey not found' })

  const [isBoard, { eligible, reason }] = await Promise.all([
    isBoardMember(session.personId),
    surveyEligibility(session.personId, survey),
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
    ineligibleReason: reason,
    hasLuma: Boolean(survey.lumaEventId),
    attendeeCount: isBoard ? survey.attendeeCount : null,
    canAnswer: eligible && isOpen,
    isBoard,
    responseCount,
    myAnswers: own?.answers ?? null,
    mySubmittedAt: own?.submittedAt ?? null,
    myUpdatedAt: own?.updatedAt ?? null,
  }
})
