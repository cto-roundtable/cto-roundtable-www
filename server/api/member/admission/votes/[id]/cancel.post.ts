// POST /api/member/admission/votes/:id/cancel: the board cancels a running vote (nothing is counted).
export default defineEventHandler(async (event) =>
  cancelAdmissionVote(await admissionViewer(event), getRouterParam(event, 'id')),
)
