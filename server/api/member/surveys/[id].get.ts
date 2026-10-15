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

  const sql = useDatabase()
  const [mine, count] = await Promise.all([
    sql`
      SELECT answers, submitted_at, updated_at
      FROM event_survey_responses
      WHERE survey_id = ${id} AND person_id = ${session.personId}
      LIMIT 1
    `,
    isBoard ? sql`SELECT COUNT(*)::int AS n FROM event_survey_responses WHERE survey_id = ${id}` : Promise.resolve([]),
  ])
  const own: any = mine[0]
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
    responseCount: isBoard ? ((count[0] as any)?.n ?? 0) : null,
    myAnswers: own?.answers ?? null,
    mySubmittedAt: own?.submitted_at ?? null,
    myUpdatedAt: own?.updated_at ?? null,
  }
})
