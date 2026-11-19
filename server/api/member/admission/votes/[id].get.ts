// GET /api/member/admission/votes/:id: one vote as this viewer may see it (roster or board, else 404).
export default defineEventHandler(async (event) => {
  const v = await admissionViewer(event)
  requireAdmissions(v.isBoard, 'read')
  return getAdmissionVote(v, getRouterParam(event, 'id'))
})
