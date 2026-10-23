// GET /api/admin/answers?since=ISO&deal=<slug>
// Current answers since a time, oldest first (max 500), for the nightly
// qa-investors.md sync. Contract: memory votes/admin-api.md in ctori-4.
export default defineAdminRoute({
  GET: {
    scope: 'qa:read',
    handler: async (event, _caller, audit) => {
      const q = getQuery(event)
      const since = typeof q.since === 'string' && q.since ? q.since : null
      if (since && Number.isNaN(Date.parse(since))) {
        throw createError({ statusCode: 400, message: 'since must be an ISO timestamp' })
      }
      const slug = typeof q.deal === 'string' && q.deal ? q.deal : null
      const answers = await adminListAnswers({ since, slug })
      audit.summary.count = answers.length
      return { answers }
    },
  },
})
