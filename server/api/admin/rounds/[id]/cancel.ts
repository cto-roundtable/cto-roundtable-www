// POST /api/admin/rounds/:id/cancel {reason}
// Cancel a draft or open round. The ballots stay; nothing is counted.
// Contract: memory votes/admin-api.md in ctori-4.
export default defineAdminRoute({
  POST: {
    scope: 'rounds:write',
    handler: async (event, caller, audit) => {
      const id = getRouterParam(event, 'id')
      if (!id) throw createError({ statusCode: 400, message: 'Missing round' })
      audit.targetType = 'deal_round'
      audit.targetId = id
      const body = (await readBody(event)) ?? {}
      return { round: await cancelRound(id, body.reason, caller.ownerPersonId) }
    },
  },
})
