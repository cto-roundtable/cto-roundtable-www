// POST /api/member/invest/:slug/documents/:key/comments
// { kind: 'question' | 'comment', body, anchor?: '<slide id>', quote? }
// A comment or question on the current version of the document, by anyone who may
// see the offering. Only the committee and the author ever see who wrote it.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const key = getRouterParam(event, 'key') ?? ''
  const { offering } = await requireVisibleOffering(personId, slug)
  const body = (await readBody(event)) ?? {}
  return await addDocumentComment(personId, offering.id, key, body)
})
