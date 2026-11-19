// POST /api/member/admission/votes/:id/close: the board closes a running vote early and counts it.
export default defineEventHandler(async (event) => {
  const v = await admissionViewer(event)
  requireAdmissions(v.isBoard, 'manage')
  return closeAdmissionVoteNow(v, getRouterParam(event, 'id'))
})
