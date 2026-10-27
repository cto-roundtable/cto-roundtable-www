// POST /api/member/deals/:slug/ledger/follow-up-owner {personId}
// Hand the follow-up over (dc-39): the current owner's deal_people row is closed
// and a new one opened, so each holder's months follow from the dates. Committee
// only; audited by the deal_people trigger.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing case' })
  const personId = await requireCommittee(event)
  const deal = await requireCase(await caseViewer(personId), slug)
  const body = (await readBody(event)) ?? {}
  return setFollowUpOwner(deal.id, body.personId, personId)
})
