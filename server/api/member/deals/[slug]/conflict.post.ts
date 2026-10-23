// POST /api/member/deals/:slug/conflict {reason?}
// "Jeg er inhabil" (mandate §9): the member's own conflict on the company. It freezes
// into the roster when a round opens; then only a blank vote is possible
// (server/utils/dealConflicts.ts).
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing case' })
  const personId = event.context.session.personId
  const deal = await requireCase(await caseViewer(personId), slug)
  return declareConflict(personId, deal.id, (await readBody(event)) ?? {})
})
