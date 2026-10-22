// GET /api/member/deals/:slug/rounds/:id/protocol
// The protocol PDF of a closed round, for everyone who can see the case. It
// lists who took part, not what they voted.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const id = getRouterParam(event, 'id')
  if (!slug || !id) throw createError({ statusCode: 400, message: 'Missing round' })
  const viewer = await caseViewer(event.context.session.personId)
  const deal = await requireCase(viewer, slug)
  const round = await requireRoundOfDeal(deal.id, id)
  const pdf = await readProtocol(round)
  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `inline; filename="protokoll-${slug.replace(/[^a-z0-9-]/g, '')}.pdf"`)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return pdf
})
