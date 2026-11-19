// GET /api/member/admission: member admission (vedtekter § 4.1, server/utils/admission.ts).
// Everyone: the votes they are on the roster of. The board also: the list and the group status.
export default defineEventHandler(async (event) => {
  const v = await admissionViewer(event)
  const votes = await listAdmissionVotes(v)
  if (!v.isBoard) return { isBoard: false, votes, groups: null, candidates: null }
  const [groups, candidates] = await Promise.all([admissionGroups(), listCandidates(v)])
  return { isBoard: true, votes, groups, candidates }
})
