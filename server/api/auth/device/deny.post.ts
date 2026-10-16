// POST /api/auth/device/deny  { user_code }
// A styret member refuses the agent; its next poll gets access_denied. No fresh
// sign-in needed: saying no grants nothing. Same refusals as approve.

export default defineDeviceRoute(async (event, audit) => {
  audit.summary.step = 'deny'
  const body: any = (await readBody(event).catch(() => null)) ?? {}
  const userCode = normalizeUserCode(body.user_code)
  if (!userCode) throw createError({ statusCode: 400, message: 'Not a code' })

  await requireApprover(event, audit, false)

  const sql = useDatabase()
  const rows = await sql`
    UPDATE device_authorizations
    SET status = 'denied', decided_at = NOW()
    WHERE user_code = ${userCode} AND status = 'pending' AND expires_at > NOW()
    RETURNING id
  `
  if (rows.length) {
    audit.targetId = (rows[0] as any).id
    audit.summary.result = 'denied'
    return { status: 'denied' }
  }
  return refuseDecision(event, audit, userCode)
})
