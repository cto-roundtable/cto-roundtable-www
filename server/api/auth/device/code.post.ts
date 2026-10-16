// POST /api/auth/device/code  { client_name, scopes }
// Step 1 of `ctr login` (RFC 8628 3.1-3.2): a code pair for an agent. No auth:
// nothing is granted until a styret member approves at /member/device.
// 400 invalid_request / invalid_scope, 429 slow_down past MAX_PENDING_PER_IP.

export default defineDeviceRoute(async (event, audit) => {
  audit.summary.step = 'code'
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const body: any = (await readBody(event).catch(() => null)) ?? {}

  const clientName = typeof body.client_name === 'string' ? body.client_name.replace(/[\p{Cc}\s]+/gu, ' ').trim() : ''
  if (!clientName || clientName.length > 100) {
    return deviceError(event, audit, 400, 'invalid_request', 'client_name is required, at most 100 characters')
  }
  audit.summary.client_name = clientName

  const requested = body.scopes
  if (!Array.isArray(requested) || requested.length === 0) {
    return deviceError(event, audit, 400, 'invalid_scope', 'scopes must be a non-empty array')
  }
  const unknown = requested.filter((s) => !(API_SCOPES as readonly unknown[]).includes(s))
  if (unknown.length) {
    return deviceError(
      event,
      audit,
      400,
      'invalid_scope',
      `unknown scope: ${unknown.map(String).join(', ').slice(0, 200)}`,
    )
  }
  const scopes = API_SCOPES.filter((s) => requested.includes(s))
  audit.summary.scopes = scopes.join(' ')

  const ip = requestIp(event)
  audit.summary.ip = ip
  const sql = useDatabase()
  const [{ pending }] = (await sql`
    SELECT count(*)::int AS pending FROM device_authorizations
    WHERE requested_ip IS NOT DISTINCT FROM ${ip} AND status = 'pending' AND expires_at > NOW()
  `) as any[]
  if (pending >= MAX_PENDING_PER_IP) {
    return deviceError(event, audit, 429, 'slow_down', `at most ${MAX_PENDING_PER_IP} pending codes per address`)
  }

  const uri = verificationUri(event)
  const { deviceCode, hash } = newDeviceCode()
  // A user_code collision (20^8 space) is retried with a fresh one.
  for (let attempt = 0; attempt < 3; attempt++) {
    const userCode = newUserCode()
    const rows = await sql`
      INSERT INTO device_authorizations (device_code_hash, user_code, client_name, scopes, requested_ip, expires_at)
      VALUES (${hash}, ${userCode}, ${clientName}, ${scopes}, ${ip}, NOW() + make_interval(secs => ${DEVICE_CODE_TTL_S}))
      ON CONFLICT (user_code) DO NOTHING
      RETURNING id
    `
    if (!rows.length) continue
    audit.targetId = (rows[0] as any).id
    audit.summary.result = 'issued'
    return {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: uri,
      verification_uri_complete: `${uri}?code=${userCode}`,
      expires_in: DEVICE_CODE_TTL_S,
      interval: POLL_INTERVAL_S,
    }
  }
  throw createError({ statusCode: 500, message: 'Could not allocate a user code' })
})
