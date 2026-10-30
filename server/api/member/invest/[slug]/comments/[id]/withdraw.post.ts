// POST /api/member/invest/:slug/comments/:id/withdraw
// The author takes back their own comment, question or reply. The row is kept, marked.
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const id = getRouterParam(event, 'id') ?? ''
  const { offering } = await requireVisibleOffering(personId, slug)
  await withdrawDocumentComment(personId, offering.id, id)
  return { ok: true }
})
