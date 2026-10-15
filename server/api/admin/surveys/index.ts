// /api/admin/surveys
// GET  ?status=draft|open|closed  every survey, newest event first, with the
//      response count (the board's view). `ctr surveys ls`.
// POST {eventId, title?, intro?, questions?, closesAt?, status?: 'draft'|'open'}
//      create the survey for an event; the default template and language follow
//      the event's group, exactly as the board's "Ny undersøkelse". The token's
//      owner is recorded as created_by: they answer for it. `ctr surveys create`.
// The SQL lives in server/utils/surveys.ts; this file only adds the token gate.
const STATUSES = ['draft', 'open', 'closed']

export default defineAdminRoute({
  GET: {
    scope: 'surveys:read',
    handler: async (event, _caller, audit) => {
      const { status } = getQuery(event)
      if (status !== undefined && !STATUSES.includes(status as string)) {
        throw createError({ statusCode: 400, message: 'status must be draft, open or closed' })
      }
      const all = await listSurveysForBoard()
      const surveys = status ? all.filter((s) => s.status === status) : all
      audit.summary.count = surveys.length
      return { surveys }
    },
  },
  POST: {
    scope: 'surveys:write',
    handler: async (event, caller, audit) => {
      const body = (await readBody(event)) ?? {}
      audit.targetType = 'event'
      audit.targetId = typeof body.eventId === 'string' ? body.eventId.slice(0, 64) : null
      audit.summary.status = body.status === 'draft' ? 'draft' : 'open'
      audit.summary.defaultQuestions = body.questions === undefined || body.questions === null
      const { id } = await createSurvey(
        {
          eventId: body.eventId,
          title: body.title,
          intro: body.intro,
          questions: body.questions,
          closesAt: body.closesAt,
          status: body.status,
        },
        caller.ownerPersonId,
      )
      audit.targetType = 'survey'
      audit.targetId = id
      audit.summary.eventId = body.eventId
      setResponseStatus(event, 201)
      return { ok: true, id }
    },
  },
})
