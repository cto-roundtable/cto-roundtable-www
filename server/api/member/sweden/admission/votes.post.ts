// POST /api/member/sweden/admission/votes {joinRequestId, days?, note?}: a Sweden manager
// starts a vote on one pending application to roundtable-sweden.
export default defineEventHandler(async (event) => {
  const v = await swedenAdmissionViewer(event)
  requireSwedenAdmissions(v.isManager, 'act')
  const body = (await readBody(event)) ?? {}
  return startSwedenVote(v, body)
})
