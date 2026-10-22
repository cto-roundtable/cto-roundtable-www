// /api/admin/deals/:slug/digests
// GET  ?limit=5  the newest digests of the deal (committee and spv). The job reads
//      createdAt of the newest to know what is new.
// POST {kind: 'comments', audience: committee|spv, roundId?, bodyMd, themes,
//      founderQuestions, newInformation, commentIds, madeBy}
// Contract: memory votes/admin-api.md in ctori-4.
function slugParam(event: Parameters<typeof getRouterParam>[0]): string {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing deal' })
  return slug
}

export default defineAdminRoute({
  GET: {
    scope: 'comments:read',
    handler: async (event, _caller, audit) => {
      const slug = slugParam(event)
      audit.targetType = 'deal'
      audit.targetId = slug
      const q = getQuery(event)
      const limit = q.limit === undefined ? 5 : Number(q.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw createError({ statusCode: 400, message: 'limit must be 1 to 50' })
      }
      const deal = await adminRequireDeal(slug)
      return { digests: await listDigests(deal.id, { audience: null, limit }) }
    },
  },
  POST: {
    scope: 'digests:write',
    handler: async (event, _caller, audit) => {
      const slug = slugParam(event)
      audit.targetType = 'deal'
      audit.targetId = slug
      const body = (await readBody(event)) ?? {}
      audit.summary.audience = typeof body.audience === 'string' ? body.audience : null
      const deal = await adminRequireDeal(slug)
      return addDigest(deal.id, body)
    },
  },
})
