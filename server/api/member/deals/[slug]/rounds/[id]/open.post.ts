// POST /api/member/deals/:slug/rounds/:id/open
// A committee member opens a draft round: the roster is frozen from the SPV
// group and the 48 hours start. The deal-rounds job then sends the notices.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const id = getRouterParam(event, 'id')
  if (!slug || !id) throw createError({ statusCode: 400, message: 'Missing round' })
  const personId = await requireCommittee(event)
  const viewer = await caseViewer(personId)
  const deal = await requireCase(viewer, slug)
  const round = await requireRoundOfDeal(deal.id, id)
  await openRound(round.id, personId)
  return { ok: true }
})
