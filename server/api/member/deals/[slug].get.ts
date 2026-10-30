// GET /api/member/deals/:slug
// One case: the deal, its current documents (raw inputs first, memo last), its
// rounds with their counts (named ballots for the committee only), the Q&A as this
// member may see it (server/utils/dealQuestions.ts), and
// the comments: all with names for the committee, only their own for a member
// (server/utils/dealComments.ts), and the digests of them (server/utils/dealDigests.ts).
// 404 for a case the member may not see, the same as for one that does not exist
// (a new lead is the committee's only).
// Document BYTES are not returned here: the page links to
// /api/member/deals/:slug/documents/:id.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing case' })

  const viewer = await caseViewer(event.context.session.personId)
  const deal = await requireCase(viewer, slug)
  const isLead = viewer.isCommittee && deal.status === LEAD_STATUS
  const [documents, rounds, qa, comments, digests, conflict, conflicts, lead] = await Promise.all([
    deal.materialShared ? listCaseDocuments(deal.id) : Promise.resolve([]),
    caseRoundsView(viewer, deal.id),
    listCaseQuestions(viewer, deal.id, deal.materialShared),
    listCaseComments(viewer, deal.id),
    caseDigests(viewer, deal.id, deal.materialShared),
    myConflict(viewer.personId, deal.id),
    viewer.isCommittee ? listConflicts(deal.id) : Promise.resolve(null),
    isLead ? listLeads(slug).then((l) => l[0] ?? null) : Promise.resolve(null),
  ])

  const { id: _id, ...publicDeal } = deal
  return {
    viewer: { isCommittee: viewer.isCommittee },
    deal: publicDeal,
    documents: documents.map(({ sha256, ...d }) => ({ ...d, sha256: sha256.slice(0, 12) })),
    rounds,
    questions: qa.questions,
    questionsWaiting: qa.waiting,
    // The committee and the deal's ansvarlig (lead or co-lead) answer, confirm and close.
    canAnswer: viewer.isCommittee || isDealDriver(deal, viewer.personId),
    comments,
    // The newest digest of the comments: the committee one for staff, the SPV one for all
    // who have the material (none before it is shared, server/utils/dealDigests.ts).
    digests,
    // "Jeg er inhabil" (dc-33 H3): the member's own; everyone's for the committee.
    conflict,
    conflicts,
    // A new lead (committee only, members get the 404 above): how it came in, and the
    // committee's moves out of 'incoming' (POST /api/member/committee/leads/:slug).
    lead,
  }
})
