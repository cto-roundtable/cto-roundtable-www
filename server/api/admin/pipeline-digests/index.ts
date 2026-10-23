// /api/admin/pipeline-digests
// GET  ?status=draft|approved|rejected|sent&group=invest-3&limit=20  newest period first
// POST {group, periodStart (a Monday), bodyMd, items: [{slug, change}], madeBy}
//      -> {digest}: a draft, or approved at once once the group's first approved
//      digest is 28 days old. 409 if the group already has one for that period.
// The digest every second Monday (server/utils/pipelineDigests.ts). Contract: memory votes/admin-api.md.
export default defineAdminRoute({
  GET: {
    scope: 'deals:read',
    handler: async (event) => {
      const q = getQuery(event)
      const limit = q.limit === undefined ? 20 : Number(q.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw createError({ statusCode: 400, message: 'limit must be 1 to 100' })
      }
      return { digests: await listPipelineDigests({ status: q.status, group: q.group, limit }) }
    },
  },
  POST: {
    scope: 'digests:write',
    handler: async (event, _caller, audit) => {
      const body = (await readBody(event)) ?? {}
      audit.targetType = 'network_group'
      audit.targetId = typeof body.group === 'string' ? body.group : null
      const out = await createPipelineDigest(body)
      audit.summary.status = out.digest.status
      return out
    },
  },
})
