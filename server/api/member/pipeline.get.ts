// GET /api/member/pipeline
// The pipeline feed: the working pipeline for the active SPV, and the companies
// the member's own SPVs invested in (server/utils/deals.ts, listPipeline).
export default defineEventHandler(async (event) => {
  const viewer = await caseViewer(event.context.session.personId)
  return { viewer: { isCommittee: viewer.isCommittee, isStaff: viewer.isStaff }, ...(await listPipeline(viewer)) }
})
