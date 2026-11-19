// GET /api/member/admission/votes/:id: one vote as this viewer may see it (roster or board, else 404).
export default defineEventHandler(async (event) =>
  getAdmissionVote(await admissionViewer(event), getRouterParam(event, 'id')),
)
