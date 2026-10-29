// GET /api/member/deals[?declined=1]
// The cases overview, always as a MEMBER sees it (Snorre, 2026-10-29: everyone lands
// on the member view; the committee's extras are on /member/komite): decided cases,
// cases under review now, inactive ones, and what the member's own SPVs invested in
// (server/utils/deals.ts, listCaseOverview). With ?declined=1 also the companies the
// committee said no to. There is no "see as another role" (Snorre, 2026-10-30).
export default defineEventHandler(async (event) => {
  const viewer = await caseViewer(event.context.session.personId)
  const declined = getQuery(event).declined === '1'
  // The committee's own list is /member/komite: here a committee member is a member too.
  const asMember: CaseViewer = { ...viewer, isCommittee: false }
  const [overview, latestDigest] = await Promise.all([
    listCaseOverview(asMember, { declined }),
    // The newest digest that went out to the viewer's investing SPV (every second Monday).
    declined ? null : latestSentDigest(asMember),
  ])
  return {
    viewer: { isCommittee: viewer.isCommittee },
    ...overview,
    latestDigest,
  }
})
