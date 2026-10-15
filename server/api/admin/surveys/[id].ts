// /api/admin/surveys/:id
// GET   the survey, its questions and the response count. `ctr surveys show`.
// PATCH {status: 'open'|'closed', closesAt?}  close or reopen. Nothing else:
//       editing questions or copy stays in the portal, where the board sees it.
//       `ctr surveys close|reopen`.
const PATCH_KEYS = ['status', 'closesAt']

export default defineAdminRoute({
  GET: {
    scope: 'surveys:read',
    handler: async (event, _caller, audit) => {
      const id = surveyIdParam(event)
      audit.targetType = 'survey'
      audit.targetId = id
      const survey = await loadSurvey(id)
      if (!survey) throw createError({ statusCode: 404, message: 'Survey not found' })
      const { responseCount } = await loadSurveyResults(survey, false)
      return { survey, isOpen: isOpenForAnswers(survey), responseCount }
    },
  },
  PATCH: {
    scope: 'surveys:write',
    handler: async (event, _caller, audit) => {
      const id = surveyIdParam(event)
      audit.targetType = 'survey'
      audit.targetId = id
      const body = (await readBody(event)) ?? {}
      const extra = Object.keys(body).filter((k) => !PATCH_KEYS.includes(k))
      if (extra.length) {
        throw createError({
          statusCode: 400,
          message: `Only status and closesAt can change here, not ${extra.join(', ')}`,
        })
      }
      if (body.status !== 'open' && body.status !== 'closed') {
        throw createError({ statusCode: 400, message: 'status must be open or closed' })
      }
      audit.summary.status = body.status
      if (body.closesAt !== undefined) audit.summary.closesAt = body.closesAt === null ? null : String(body.closesAt)
      await updateSurvey(
        id,
        body.closesAt === undefined ? { status: body.status } : { status: body.status, closesAt: body.closesAt },
      )
      return { ok: true }
    },
  },
})
