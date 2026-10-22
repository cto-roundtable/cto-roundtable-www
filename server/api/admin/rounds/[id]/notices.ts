// POST /api/admin/rounds/:id/notices {channel: slack, kind, sentAt, providerRef}
// Records a notice the portal did not send itself (the job's Slack post), for
// every roster member. Contract: memory votes/admin-api.md in ctori-4.
export default defineAdminRoute({
  POST: {
    scope: 'rounds:write',
    handler: async (event, _caller, audit) => {
      const id = getRouterParam(event, 'id')
      if (!id) throw createError({ statusCode: 400, message: 'Missing round' })
      audit.targetType = 'deal_round'
      audit.targetId = id
      const body = (await readBody(event)) ?? {}
      const out = await recordNotices(id, body)
      audit.summary.recorded = out.recorded
      return out
    },
  },
})
