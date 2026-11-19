// POST /api/member/admission/votes {personId, days?, note?}: the board starts a member vote on one candidate.
export default defineEventHandler(async (event) => {
  const v = await admissionViewer(event)
  requireAdmissions(v.isBoard, 'act')
  const body = (await readBody(event)) ?? {}
  return startAdmissionVote(v, body)
})
