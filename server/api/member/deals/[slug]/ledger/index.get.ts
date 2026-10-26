// GET /api/member/deals/:slug/ledger
// The hovedbok for the committee (dc-39): the snapshot of each closed CTORI4 round,
// the shares (equal, by months held, or as the committee adjusted them), the
// follow-up owner history and who can be named. Members never see any of it.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing case' })
  const personId = await requireCommittee(event)
  const deal = await requireCase(await caseViewer(personId), slug)
  return hovedbok(deal.id)
})
