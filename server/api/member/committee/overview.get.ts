// GET /api/member/committee/overview
// The committee's overview of every case: the vote, questions waiting for the
// owner, agent answers not yet confirmed, comments since the last digest, and
// the newest digest; and pipeline digest drafts to approve. Committee only: the board sees
// what a member sees (Snorre, 2026-10-29).
export default defineEventHandler(async (event) => {
  const viewer = await caseViewer(event.context.session.personId)
  if (!viewer.isCommittee) throw createError({ statusCode: 403, message: 'Committee only' })
  const [cases, drafts, recent] = await Promise.all([
    committeeOverview(),
    listPipelineDigests({ status: 'draft', group: undefined, limit: 10 }),
    listPipelineDigests({ status: undefined, group: undefined, limit: 4 }),
  ])
  // The digest every second Monday: drafts wait here for approval the first four weeks.
  return { cases, pipelineDigests: { drafts, recent: recent.filter((d) => d.status !== 'draft') } }
})
