// GET /api/admin/rounds?status=open
// Portal rounds (not email-era history), newest first, with their counts. What
// the deal-rounds job polls. Contract: memory votes/admin-api.md in ctori-4.
export default defineAdminRoute({
  GET: {
    scope: 'deals:read',
    handler: async (event, _caller, audit) => {
      const q = getQuery(event)
      const status = typeof q.status === 'string' && q.status ? q.status : null
      const rounds = await listRounds(status)
      audit.summary.count = rounds.length
      return { rounds }
    },
  },
})
