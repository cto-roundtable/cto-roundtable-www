// POST /api/member/sweden/admission/votes/:id/cancel: a Sweden manager cancels a running vote (nothing is counted).
export default defineEventHandler(async (event) => {
  const v = await swedenAdmissionViewer(event)
  requireSwedenAdmissions(v.isManager, 'manage')
  return cancelSwedenVote(v, getRouterParam(event, 'id'))
})
