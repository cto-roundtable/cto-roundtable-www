// GET /api/member/deals/:slug
// One case, read-only: the deal, its current documents (raw inputs first, memo
// last) and its rounds. 404 for a case the member may not see, the same as for
// one that does not exist. Document BYTES are not returned here: the page links
// to /api/member/deals/:slug/documents/:id.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing case' })

  const viewer = await caseViewer(event.context.session.personId)
  const deal = await requireCase(viewer, slug)
  const [documents, rounds] = await Promise.all([listCaseDocuments(deal.id), listCaseRounds(viewer, deal.id)])

  const { id: _id, ...publicDeal } = deal
  return {
    viewer: { isCommittee: viewer.isCommittee, isStaff: viewer.isStaff },
    deal: publicDeal,
    documents: documents.map(({ sha256, ...d }) => ({ ...d, sha256: sha256.slice(0, 12) })),
    rounds,
  }
})
