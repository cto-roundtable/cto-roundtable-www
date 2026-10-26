// GET /api/member/committee/overview
// The committee's overview of every case: the vote, questions waiting for the
// owner, agent answers not yet confirmed, comments since the last digest, and
// the newest digest. Committee and board only.
export default defineEventHandler(async (event) => {
  const viewer = await caseViewer(event.context.session.personId)
  if (!viewer.isStaff) throw createError({ statusCode: 403, message: 'Committee only' })
  return { cases: await committeeOverview() }
})
