// GET /api/member/pipeline[?declined=1]
// The pipeline feed: all active work for the active SPV, and the companies the
// member's own SPVs invested in; with ?declined=1 also the companies the committee
// said no to (server/utils/deals.ts, listPipeline).
export default defineEventHandler(async (event) => {
  const viewer = await caseViewer(event.context.session.personId)
  const declined = getQuery(event).declined === '1'
  return {
    viewer: { isCommittee: viewer.isCommittee, isStaff: viewer.isStaff },
    ...(await listPipeline(viewer, { declined })),
  }
})
