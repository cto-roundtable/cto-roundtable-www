// POST /api/member/deals/:slug/rounds/:id/close {lead?, followUpOwner?}
// A committee member closes a round whose 48 hours are up (the deal-rounds job does
// the same through the admin API). For a CTORI4 round that passed, the hovedbok
// needs the deal's lead and follow-up owner (dc-39): a 409 {missing} says which, and
// the close screen sends the person ids, written in the same transaction as the close.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const id = getRouterParam(event, 'id')
  if (!slug || !id) throw createError({ statusCode: 400, message: 'Missing round' })
  const personId = await requireCommittee(event)
  const viewer = await caseViewer(personId)
  const deal = await requireCase(viewer, slug)
  const round = await requireRoundOfDeal(deal.id, id)
  const body = (await readBody(event)) ?? {}
  const extra = Object.keys(body).filter((k) => k !== 'lead' && k !== 'followUpOwner')
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
  const out = await closeRound(round.id, personId, { lead: body.lead, followUpOwner: body.followUpOwner })
  return { result: out.round.result }
})
