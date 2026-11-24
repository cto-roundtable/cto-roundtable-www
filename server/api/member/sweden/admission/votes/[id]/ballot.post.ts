// POST /api/member/sweden/admission/votes/:id/ballot {choice, note?}: a roster member votes
// yes, no or blank, with an optional note. Secret and final.
export default defineEventHandler(async (event) => {
  const v = await swedenAdmissionViewer(event)
  requireSwedenAdmissions(v.isManager, 'act')
  const body = (await readBody(event)) ?? {}
  return castSwedenBallot(v, getRouterParam(event, 'id'), body)
})
