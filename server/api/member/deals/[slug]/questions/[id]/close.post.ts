// POST /api/member/deals/:slug/questions/:id/close
// Close a question without (another) answer: a duplicate, or answered elsewhere.
export default defineEventHandler(async (event) => {
  const { viewer, dealId, questionId } = await questionContext(event)
  await closeQuestion(viewer, dealId, questionId)
  return { ok: true }
})
