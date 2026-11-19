// POST /api/member/admission/votes/:id/ballot {choice}: a roster member votes yes, no or blank. Secret and final.
export default defineEventHandler(async (event) => {
  const v = await admissionViewer(event)
  const body = (await readBody(event)) ?? {}
  return castAdmissionBallot(v, getRouterParam(event, 'id'), body.choice)
})
