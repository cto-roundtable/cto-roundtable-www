// POST /api/auth/device/approve  { user_code }
// A styret member, signed in within REAUTH_WINDOW_MS, lets the agent in. The
// token itself is created when the agent picks it up (token.post.ts), owned by
// this approver. 403 { code: 'reauth' } on an older sign-in, 404 unknown,
// 410 { code: 'expired' }, 409 { code: 'decided', status } if already decided.
// A request for a COMMITTEE_SCOPES scope (deals:read, comments:read, qa:read) needs
// an approver on the committee too, since the token is theirs (dc-61 H2):
// 403 { code: 'committee' } otherwise.

export default defineDeviceRoute(async (event, audit) => {
  audit.summary.step = 'approve'
  const body: any = (await readBody(event).catch(() => null)) ?? {}
  const userCode = normalizeUserCode(body.user_code)
  if (!userCode) throw createError({ statusCode: 400, message: 'Not a code' })

  const approver = await requireApprover(event, audit, true)
  if (!approver) return { code: 'reauth' }

  const request = await findDeviceRequest(userCode)
  if (request && needsCommittee(request.scopes) && !(await isCommitteeMember(approver.personId))) {
    audit.targetId = request.id
    audit.summary.reason = 'not_committee'
    setResponseStatus(event, 403)
    return { code: 'committee' }
  }

  const sql = useDatabase()
  const rows = await sql`
    UPDATE device_authorizations
    SET status = 'approved', approved_by = ${approver.personId}, decided_at = NOW()
    WHERE user_code = ${userCode} AND status = 'pending' AND expires_at > NOW()
    RETURNING id, client_name, scopes
  `
  if (rows.length) {
    const r: any = rows[0]
    audit.targetId = r.id
    audit.summary.result = 'approved'
    audit.summary.scopes = (r.scopes as string[]).join(' ')
    return { status: 'approved', clientName: r.client_name, scopes: r.scopes }
  }
  return refuseDecision(event, audit, userCode)
})
