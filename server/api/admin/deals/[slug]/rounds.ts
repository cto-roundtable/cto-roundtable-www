// POST /api/admin/deals/:slug/rounds {group, proposal, documents: [keys]}
// A draft round for one SPV group, with the proposal and the current version of
// each named document snapshotted and hashed (bundleSha256). The rules are the
// server's, never the caller's. 409 if a draft or open round exists for that
// group. `ctr deals publish`. Contract: memory votes/admin-api.md in ctori-4.
const KEYS = ['group', 'proposal', 'documents']

export default defineAdminRoute({
  POST: {
    scope: 'rounds:write',
    handler: async (event, _caller, audit) => {
      const slug = getRouterParam(event, 'slug')
      if (!slug) throw createError({ statusCode: 400, message: 'Missing deal' })
      audit.targetType = 'deal'
      audit.targetId = slug
      const body = (await readBody(event)) ?? {}
      const extra = Object.keys(body).filter((k) => !KEYS.includes(k))
      if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
      const deal = await adminRequireDeal(slug)
      const round = await createDraftRound(deal.id, body)
      audit.summary.group = round.group
      return { round }
    },
  },
})
