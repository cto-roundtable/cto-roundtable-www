// POST /api/member/invest/:slug/documents/:key/comments
// { kind: 'question' | 'comment', body, visibility?: 'committee' | 'all',
//   anchor?: '<slide id>' | '<block anchor>', slide?: '<slide id>' | '<n>', target?: {...}, quote? }
// A comment or question on the current version of the document, by anyone who may
// see the offering. The writer chooses who sees it: the committee only (the default),
// or every member who can see the offering (server/utils/investComments.ts).
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const key = getRouterParam(event, 'key') ?? ''
  const { offering } = await requireVisibleOffering(personId, slug)
  const body = (await readBody(event)) ?? {}
  return await addDocumentComment(personId, offering.id, key, body)
})
