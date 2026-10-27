// GET /api/member/deals/:slug/documents/:id
// Streams one document version from GCS after the case check. Proxying (not
// signed URLs) re-checks access on every request, so no long-lived link escapes
// the SPV. Any version opens, so a link from an old ballot or mail still works.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const id = getRouterParam(event, 'id')
  if (!slug || !id) throw createError({ statusCode: 400, message: 'Missing document' })
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 404, message: 'Document not found' })

  const viewer = await caseViewer(event.context.session.personId)
  const deal = await requireCase(viewer, slug)
  const doc = deal.materialShared ? await loadCaseDocument(deal.id, id) : null
  if (!doc) throw createError({ statusCode: 404, message: 'Document not found' })

  const obj = await readDealDocumentObject(doc.objectKey)
  const ext = doc.objectKey.split('.').pop() || 'bin'
  const filename = `${slug}-${doc.key}-v${doc.version}.${ext}`

  setHeader(event, 'Content-Type', doc.contentType || obj.contentType)
  setHeader(event, 'Content-Disposition', `inline; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '')}"`)
  // Private, member-scoped content: never let a shared/CDN cache hold it.
  setHeader(event, 'Cache-Control', 'private, no-store')
  return obj.data
})
