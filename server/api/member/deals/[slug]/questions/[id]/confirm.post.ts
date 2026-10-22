// POST /api/member/deals/:slug/questions/:id/confirm
// The deal owner (or a committee or board member) marks the agent's answer as
// right, so members no longer see it labelled "not checked by the committee".
export default defineEventHandler(async (event) => {
  const { viewer, dealId, questionId } = await questionContext(event)
  await confirmAnswer(viewer, dealId, questionId)
  return { ok: true }
})
