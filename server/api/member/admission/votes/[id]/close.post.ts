// POST /api/member/admission/votes/:id/close: the board closes a running vote early and counts it.
export default defineEventHandler(async (event) =>
  closeAdmissionVoteNow(await admissionViewer(event), getRouterParam(event, 'id')),
)
