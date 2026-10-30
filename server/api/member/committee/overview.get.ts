// GET /api/member/committee/overview
// The committee's overview of every case: the vote, questions waiting for the
// owner, agent answers not yet confirmed, comments since the last digest, and
// the newest digest; pipeline digest drafts to approve; and the new leads (status
// 'incoming', listLeads), which only the committee sees. Committee only: the board sees
// what a member sees (Snorre, 2026-10-29).
export default defineEventHandler(async (event) => {
  const viewer = await caseViewer(event.context.session.personId)
  if (!viewer.isCommittee) throw createError({ statusCode: 403, message: 'Committee only' })
  const [cases, leads, drafts, recent] = await Promise.all([
    committeeOverview(),
    listLeads(),
    listPipelineDigests({ status: 'draft', group: undefined, limit: 10 }),
    listPipelineDigests({ status: undefined, group: undefined, limit: 4 }),
  ])
  // The digest every second Monday: drafts wait here for approval the first four weeks.
  return {
    cases,
    leads,
    inactiveAfterDays: INACTIVE_AFTER_DAYS,
    pipelineDigests: { drafts, recent: recent.filter((d) => d.status !== 'draft') },
  }
})
