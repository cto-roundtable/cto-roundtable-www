// GET /api/admin/questions?status=new&status=routed&deal=<slug>&limit=20
// The question queue, oldest first. Who asked is never returned. `ctr qa ls`,
// and what the deal-qa job polls. Contract: memory votes/admin-api.md in ctori-4.
export default defineAdminRoute({
  GET: {
    scope: 'qa:read',
    handler: async (event, _caller, audit) => {
      const q = getQuery(event)
      const statuses = ([] as unknown[])
        .concat(q.status ?? [])
        .map(String)
        .filter(Boolean)
      const slug = typeof q.deal === 'string' && q.deal ? q.deal : null
      const limit = q.limit === undefined ? 20 : Number(q.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw createError({ statusCode: 400, message: 'limit must be 1 to 200' })
      }
      const questions = await adminListQuestions({ statuses, slug, limit })
      audit.summary.count = questions.length
      return { questions }
    },
  },
})
