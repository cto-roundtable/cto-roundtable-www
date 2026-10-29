// GET /api/member/deals/:slug
// One case: the deal, its current documents (raw inputs first, memo last), its
// rounds with their counts (named ballots for the committee only), the Q&A as this
// member may see it (server/utils/dealQuestions.ts), and
// the comments: all with names for the committee, only their own for a member
// (server/utils/dealComments.ts), and the digests of them (server/utils/dealDigests.ts).
// 404 for a case the member may not see, the same as for one that does not exist.
// Document BYTES are not returned here: the page links to
// /api/member/deals/:slug/documents/:id.
// A committee member may add ?som=<role> to see the case as that role does
// (viewerForRequest in server/utils/deals.ts); a role that may not see it gets the 404.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing case' })

  const viewer = await viewerForRequest(event)
  const deal = await requireCase(viewer, slug)
  const [documents, rounds, qa, comments, digests, conflict, conflicts] = await Promise.all([
    deal.materialShared ? listCaseDocuments(deal.id) : Promise.resolve([]),
    caseRoundsView(viewer, deal.id),
    listCaseQuestions(viewer, deal.id, deal.materialShared),
    listCaseComments(viewer, deal.id),
    caseDigests(viewer, deal.id, deal.materialShared),
    myConflict(viewer.personId, deal.id),
    viewer.isCommittee ? listConflicts(deal.id) : Promise.resolve(null),
  ])

  const { id: _id, ...publicDeal } = deal
  return {
    viewer: { isCommittee: viewer.isCommittee },
    preview: viewer.preview,
    deal: publicDeal,
    documents: documents.map(({ sha256, ...d }) => ({ ...d, sha256: sha256.slice(0, 12) })),
    rounds,
    questions: qa.questions,
    questionsWaiting: qa.waiting,
    // The committee and the deal owner answer, confirm and close.
    canAnswer: viewer.isCommittee || deal.owner?.id === viewer.personId,
    comments,
    // The newest digest of the comments: the committee one for staff, the SPV one for all
    // who have the material (none before it is shared, server/utils/dealDigests.ts).
    digests,
    // "Jeg er inhabil" (dc-33 H3): the member's own; everyone's for the committee.
    conflict,
    conflicts,
  }
})
