// POST /api/member/deals/:slug/conflict/withdraw
// Withdraw one's own conflict, unless a vote on the company is open (the roster is frozen).
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing case' })
  const personId = event.context.session.personId
  const deal = await requireCase(await caseViewer(personId), slug)
  return withdrawConflict(personId, deal.id)
})
