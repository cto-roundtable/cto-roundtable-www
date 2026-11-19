// POST /api/member/admission/votes/:id/cancel: the board cancels a running vote (nothing is counted).
export default defineEventHandler(async (event) => {
  const v = await admissionViewer(event)
  requireAdmissions(v.isBoard, 'manage')
  return cancelAdmissionVote(v, getRouterParam(event, 'id'))
})
