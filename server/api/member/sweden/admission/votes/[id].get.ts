// GET /api/member/sweden/admission/votes/:id: one Sweden vote as this viewer may see it
// (its roster or a manager, else 404). Managers get the notes once it is closed.
export default defineEventHandler(async (event) => {
  const v = await swedenAdmissionViewer(event)
  requireSwedenAdmissions(v.isManager, 'read')
  return getSwedenVote(v, getRouterParam(event, 'id'))
})
