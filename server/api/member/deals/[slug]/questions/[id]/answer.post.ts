// POST /api/member/deals/:slug/questions/:id/answer {bodyMd, fromFounder}
// The deal owner (or a committee or board member) answers in the portal. The new
// answer supersedes an earlier one, and the asker gets a mail.
export default defineEventHandler(async (event) => {
  const { viewer, dealId, questionId } = await questionContext(event)
  const body = (await readBody(event)) ?? {}
  await answerAsOwner(event, viewer, dealId, questionId, { bodyMd: body.bodyMd, fromFounder: body.fromFounder })
  return { ok: true }
})
