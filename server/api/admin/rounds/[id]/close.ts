// POST /api/admin/rounds/:id/close
// After the deadline: count, freeze the result, render the protocol PDF, log
// round_closed. 409 before closesAt. A closed round returns its frozen result.
// A passed CTORI4 round without a lead or follow-up owner is a 409 {missing}: the
// committee names them on the case page's close screen (dc-39).
// Contract: memory votes/admin-api.md in ctori-4.
export default defineAdminRoute({
  POST: {
    scope: 'rounds:write',
    handler: async (event, caller, audit) => {
      const id = getRouterParam(event, 'id')
      if (!id) throw createError({ statusCode: 400, message: 'Missing round' })
      audit.targetType = 'deal_round'
      audit.targetId = id
      const out = await closeRound(id, caller.ownerPersonId, {}, 'api')
      audit.summary.result = out.round.result
      return out
    },
  },
})
