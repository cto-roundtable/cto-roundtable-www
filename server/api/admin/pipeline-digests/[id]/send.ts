// POST /api/admin/pipeline-digests/:id/send   ?dryRun=1
// The portal mails the digest to the active members of its group. 409 unless
// approved. Marked sent before the first mail, so a retry never mails twice.
export default defineAdminRoute({
  POST: {
    scope: 'digests:write',
    handler: async (event, _caller, audit) => {
      const id = getRouterParam(event, 'id')
      if (!id) throw createError({ statusCode: 400, message: 'Missing digest' })
      audit.targetType = 'pipeline_digest'
      audit.targetId = id
      const dryRun = getQuery(event).dryRun === '1'
      audit.summary.dryRun = dryRun
      const config = useRuntimeConfig()
      const out = await sendPipelineDigest(id, { dryRun, siteUrl: config.siteUrl || getRequestURL(event).origin })
      audit.summary.sent = out.sent
      audit.summary.failed = out.failed.length
      return out
    },
  },
})
