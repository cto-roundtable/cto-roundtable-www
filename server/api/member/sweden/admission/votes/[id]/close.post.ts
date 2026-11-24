// POST /api/member/sweden/admission/votes/:id/close: a Sweden manager closes a running vote early and counts it.
export default defineEventHandler(async (event) => {
  const v = await swedenAdmissionViewer(event)
  requireSwedenAdmissions(v.isManager, 'manage')
  return closeSwedenVoteNow(v, getRouterParam(event, 'id'))
})
