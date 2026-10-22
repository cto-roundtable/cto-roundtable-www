// GET /api/admin/comments?since=ISO&deal=<slug>&limit=200
// Comments with the author's name, oldest first, withdrawn ones left out. What
// the deal-digest job reads (decision 2026-10-22 §5: agents may read names).
// Contract: memory votes/admin-api.md in ctori-4.
export default defineAdminRoute({
  GET: {
    scope: 'comments:read',
    handler: async (event, _caller, audit) => {
      const q = getQuery(event)
      const since = typeof q.since === 'string' && q.since ? q.since : null
      if (since && Number.isNaN(Date.parse(since))) {
        throw createError({ statusCode: 400, message: 'since must be an ISO timestamp' })
      }
      const slug = typeof q.deal === 'string' && q.deal ? q.deal : null
      const limit = q.limit === undefined ? 200 : Number(q.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        throw createError({ statusCode: 400, message: 'limit must be 1 to 500' })
      }
      const comments = await adminListComments({ since, slug, limit })
      audit.summary.count = comments.length
      return { comments }
    },
  },
})
