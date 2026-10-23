// GET /api/member/deals
// The cases this member may see (server/utils/deals.ts has the rule), in review
// first, then by last activity. `viewer` tells the page whether to show the
// committee's extras.
export default defineEventHandler(async (event) => {
  const viewer = await caseViewer(event.context.session.personId)
  const cases = await listCases(viewer)
  return { viewer: { isCommittee: viewer.isCommittee, isStaff: viewer.isStaff }, cases }
})
