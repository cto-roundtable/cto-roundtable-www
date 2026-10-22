// /api/admin/rounds/:id
// GET   the round, its frozen roster, every ballot with names, and the notices.
// PATCH {status: 'open'} opens a draft: roster frozen, 48 hours start.
// Contract: memory votes/admin-api.md in ctori-4.
function idParam(event: Parameters<typeof getRouterParam>[0]): string {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing round' })
  return id
}

export default defineAdminRoute({
  GET: {
    scope: 'deals:read',
    handler: async (event, _caller, audit) => {
      const id = idParam(event)
      audit.targetType = 'deal_round'
      audit.targetId = id
      const { _row, ...detail } = await roundDetail(id)
      return detail
    },
  },
  PATCH: {
    scope: 'rounds:write',
    handler: async (event, caller, audit) => {
      const id = idParam(event)
      audit.targetType = 'deal_round'
      audit.targetId = id
      const body = (await readBody(event)) ?? {}
      const keys = Object.keys(body)
      if (keys.length !== 1 || body.status !== 'open') {
        throw createError({ statusCode: 400, message: 'Only {status: "open"} is accepted here' })
      }
      return { round: await openRound(id, caller.ownerPersonId) }
    },
  },
})
