// GET /api/admin/deals?visible=1&status=<status>&limit=50
// Deals with a slug, newest activity first, with their rounds. `ctr deals ls`.
// visible=1 keeps only investor-visible deals. Default 50 rows, max 200.
// Contract: memory votes/admin-api.md in the ctori-4 project.
export default defineAdminRoute({
  GET: {
    scope: 'deals:read',
    handler: async (event, _caller, audit) => {
      const q = getQuery(event)
      const limit = q.limit === undefined ? 50 : Number(q.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw createError({ statusCode: 400, message: 'limit must be 1 to 200' })
      }
      const status = typeof q.status === 'string' && q.status ? q.status : null
      const deals = await adminListDeals({ visibleOnly: q.visible === '1', status, limit })
      audit.summary.count = deals.length
      return { deals }
    },
  },
})
