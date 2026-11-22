// GET /api/member/sweden/admission: Sweden admission votes (server/utils/swedenAdmission.ts).
// Everyone: the Sweden votes they are on the roster of. The managers also: the applicants
// and Sweden's voter and manager list. Behind Sweden's own flag.
export default defineEventHandler(async (event) => {
  const v = await swedenAdmissionViewer(event)
  requireSwedenAdmissions(v.isManager, 'read')
  const votes = await listSwedenVotes(v)
  const enabled = swedenAdmissionsEnabled()
  if (!v.isManager) {
    // Not a manager, not a voter, on no roster: there is nothing here for them.
    if (!v.isVoter && votes.length === 0) throw createError({ statusCode: 404, message: 'Not found' })
    return { isManager: false, enabled, votes, candidates: null, roles: null }
  }
  const [candidates, roles] = await Promise.all([listSwedenCandidates(v), swedenRoleList(v)])
  return { isManager: true, enabled, votes, candidates, roles }
})
