// POST /api/member/admission/votes {personId, days?, note?}: the board starts a member vote on one candidate.
export default defineEventHandler(async (event) => {
  const v = await admissionViewer(event)
  const body = (await readBody(event)) ?? {}
  return startAdmissionVote(v, body)
})
