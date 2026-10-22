// GET /api/admin/rounds/:id/protocol
// The protocol PDF of a closed round (404 until closed).
// Contract: memory votes/admin-api.md in ctori-4.
export default defineAdminRoute({
  GET: {
    scope: 'deals:read',
    handler: async (event, _caller, audit) => {
      const id = getRouterParam(event, 'id')
      if (!id) throw createError({ statusCode: 400, message: 'Missing round' })
      audit.targetType = 'deal_round'
      audit.targetId = id
      const r = await loadRound(id)
      if (!r) throw createError({ statusCode: 404, message: 'Round not found' })
      const pdf = await readProtocol(r)
      setHeader(event, 'Content-Type', 'application/pdf')
      setHeader(event, 'Cache-Control', 'private, no-store')
      return pdf
    },
  },
})
