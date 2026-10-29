// GET /api/auth/device/lookup?code=ABCD-EFGH
// What the approve page shows: who is asking, for which scopes, from where.
// Styret only. `recentSignIn` tells the page whether Approve will be allowed
// or whether to ask for a fresh sign-in first.

export default defineDeviceRoute(async (event, audit) => {
  audit.summary.step = 'view'
  const approver = await requireApprover(event, audit, false)
  const userCode = normalizeUserCode(getQuery(event).code)
  if (!userCode) throw createError({ statusCode: 400, message: 'Not a code' })

  const request = await findDeviceRequest(userCode)
  if (!request) {
    audit.summary.result = 'not_found'
    throw createError({ statusCode: 404, message: 'No such code' })
  }
  audit.targetId = request.id
  audit.summary.result = request.status
  return {
    userCode,
    clientName: request.client_name,
    scopes: request.scopes,
    requestedIp: request.requested_ip,
    status: request.status,
    createdAt: request.created_at,
    expiresAt: request.expires_at,
    recentSignIn: approver!.recent,
    // Scopes that need an owner on the committee, and whether this approver is one (dc-61 H2).
    needsCommittee: needsCommittee(request.scopes),
    approverOnCommittee: await isCommitteeMember(approver!.personId),
  }
})
