// GET /api/member/deals/:slug
// One case: the deal, its current documents (raw inputs first, memo last), its
// rounds with their counts (named ballots for the committee only), the Q&A as this member may see it (server/utils/dealQuestions.ts), and
// the comments: all with names for the committee, only their own for a member
// (server/utils/dealComments.ts), and the digests of them (server/utils/dealDigests.ts).
// 404 for a case the member may not see, the same as for one that does not exist.
// Document BYTES are not returned here: the page links to
// /api/member/deals/:slug/documents/:id.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing case' })

  const viewer = await caseViewer(event.context.session.personId)
  const deal = await requireCase(viewer, slug)
  const [documents, rounds, qa, comments, digests] = await Promise.all([
    deal.materialShared ? listCaseDocuments(deal.id) : Promise.resolve([]),
    caseRoundsView(viewer, deal.id),
    listCaseQuestions(viewer, deal.id),
    listCaseComments(viewer, deal.id),
    caseDigests(viewer, deal.id),
  ])

  const { id: _id, ...publicDeal } = deal
  return {
    viewer: { isCommittee: viewer.isCommittee, isStaff: viewer.isStaff },
    deal: publicDeal,
    documents: documents.map(({ sha256, ...d }) => ({ ...d, sha256: sha256.slice(0, 12) })),
    rounds,
    questions: qa.questions,
    questionsWaiting: qa.waiting,
    // The committee, the board and the deal owner answer, confirm and close.
    canAnswer: viewer.isStaff || deal.owner?.id === viewer.personId,
    comments,
    // The newest digest of the comments: the committee one for staff, the SPV one for all.
    digests,
  }
})
