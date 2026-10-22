// POST /api/admin/rounds/:id/ballots
// {person (uuid or email), choice, method: email|on_behalf, castAt, sourceRef, auth, reason, note}
// A ballot that came by mail, or one registered on a member's behalf, while the
// round is open. The token owner is recorded as registered_by. The same Gmail
// message twice returns the first ballot with duplicate: true.
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
      audit.summary.method = typeof body.method === 'string' ? body.method : null
      const out = await registerBallot(id, body, caller.ownerPersonId)
      audit.summary.duplicate = out.duplicate
      return out
    },
  },
})
