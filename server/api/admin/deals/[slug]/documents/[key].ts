// PUT /api/admin/deals/:slug/documents/:key?title=<urlencoded>
// Raw body = the file (application/pdf, image/png, image/jpeg, text/markdown),
// at most 25 MB. A new upload of a key is a new version; the same bytes as the
// current version return {unchanged: true}. `ctr deals publish`.
// Contract: memory votes/admin-api.md in the ctori-4 project.
export default defineAdminRoute({
  PUT: {
    scope: 'deals:write',
    handler: async (event, caller, audit) => {
      const slug = getRouterParam(event, 'slug')
      const key = getRouterParam(event, 'key')
      if (!slug || !key) throw createError({ statusCode: 400, message: 'Missing deal or key' })
      audit.targetType = 'deal'
      audit.targetId = slug
      audit.summary.key = key
      const declared = Number(getHeader(event, 'content-length') || 0)
      if (declared > MAX_DOCUMENT_BYTES) throw createError({ statusCode: 413, message: 'At most 25 MB' })
      const deal = await adminRequireDeal(slug)
      const data = (await readRawBody(event, false)) ?? Buffer.alloc(0)
      const title = getQuery(event).title
      const result = await uploadDealDocument(deal, {
        key,
        title: typeof title === 'string' ? title : null,
        contentType: getHeader(event, 'content-type') || '',
        data: Buffer.from(data),
        byPersonId: caller.ownerPersonId,
      })
      audit.summary.version = result.document.version
      audit.summary.unchanged = result.unchanged
      return result
    },
  },
})
