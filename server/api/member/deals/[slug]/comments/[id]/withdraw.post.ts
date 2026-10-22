// POST /api/member/deals/:slug/comments/:id/withdraw
// The author withdraws their own comment. The row is kept, marked withdrawn, and
// the digest agent no longer reads it.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const id = getRouterParam(event, 'id')
  if (!slug || !id) throw createError({ statusCode: 400, message: 'Missing comment' })
  const viewer = await caseViewer(event.context.session.personId)
  const deal = await requireCase(viewer, slug)
  await withdrawComment(viewer.personId, deal.id, id)
  return { ok: true }
})
