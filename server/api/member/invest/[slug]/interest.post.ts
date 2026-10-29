// POST /api/member/invest/:slug/interest
// The member's soft answer: { answer: yes|maybe|no, amountNok?, vehicle?, wantsInfo?,
// wantsToHelp?, notes? }. Not binding. Only ever the caller's own row, and only while
// it is still interest or declined (server/utils/invest.ts: saveInterest).
export default defineEventHandler(async (event) => {
  const { personId } = event.context.session
  const slug = getRouterParam(event, 'slug') ?? ''
  const { offering, preview } = await requireVisibleOffering(personId, slug)
  const input = parseInterestInput(offering, await readBody(event))
  await saveInterest(offering, personId, input, preview)
  return { ok: true, mine: await getMyInterest(offering.id, personId) }
})
