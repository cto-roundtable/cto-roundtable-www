// /api/admin/pipeline-digests/:id
// GET   -> {digest}
// PATCH {slackRef} after the job posted it to Slack (approved or sent only).
function idParam(event: Parameters<typeof getRouterParam>[0]): string {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing digest' })
  return id
}

export default defineAdminRoute({
  GET: {
    scope: 'deals:read',
    handler: async (event, _caller, audit) => {
      const id = idParam(event)
      audit.targetType = 'pipeline_digest'
      audit.targetId = id
      return { digest: await getPipelineDigest(id) }
    },
  },
  PATCH: {
    scope: 'digests:write',
    handler: async (event, _caller, audit) => {
      const id = idParam(event)
      audit.targetType = 'pipeline_digest'
      audit.targetId = id
      return setPipelineDigestSlackRef(id, (await readBody(event)) ?? {})
    },
  },
})
