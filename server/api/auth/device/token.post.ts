import { randomUUID } from 'node:crypto'

// POST /api/auth/device/token  { device_code }
// The agent polls here (RFC 8628 3.4-3.5) every `interval` seconds. 400 with
// { error }: authorization_pending, slow_down (polled faster than the
// interval), expired_token, access_denied, invalid_grant (unknown code, or the
// token was already picked up), invalid_request. 200 once: the bearer token.

/** A poll this soon after the previous one is slow_down: the interval, less a second of network jitter. */
const MIN_POLL_GAP_S = POLL_INTERVAL_S - 1

export default defineDeviceRoute(async (event, audit) => {
  audit.summary.step = 'token'
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const body: any = (await readBody(event).catch(() => null)) ?? {}
  if (!isDeviceCode(body.device_code)) {
    return deviceError(event, audit, 400, 'invalid_request', 'device_code is required')
  }

  const sql = useDatabase()
  // Record this poll and read the previous one in one step; an expired code is written down as expired.
  const rows = await sql`
    WITH prev AS (
      SELECT id, last_polled_at FROM device_authorizations
      WHERE device_code_hash = ${hashDeviceCode(body.device_code)}
      FOR UPDATE
    )
    UPDATE device_authorizations d SET
      last_polled_at = NOW(),
      status = CASE WHEN d.status IN ('pending', 'approved') AND d.expires_at <= NOW() THEN 'expired' ELSE d.status END
    FROM prev
    WHERE d.id = prev.id
    RETURNING d.id, d.status,
      prev.last_polled_at IS NOT NULL AND prev.last_polled_at > NOW() - make_interval(secs => ${MIN_POLL_GAP_S}) AS too_soon
  `
  const row: any = rows[0]
  if (!row) return deviceError(event, audit, 400, 'invalid_grant')
  audit.targetId = row.id

  switch (row.status) {
    case 'expired':
      return deviceError(event, audit, 400, 'expired_token')
    case 'denied':
      return deviceError(event, audit, 400, 'access_denied')
    case 'consumed':
      return deviceError(event, audit, 400, 'invalid_grant', 'the token was already issued')
  }
  if (row.too_soon) return deviceError(event, audit, 400, 'slow_down')
  if (row.status === 'pending') return deviceError(event, audit, 400, 'authorization_pending')

  // Approved: claim it and create the token in one statement, so two racing
  // polls cannot both get one.
  const { token, hash } = newApiToken()
  const tokenId = randomUUID()
  const issued = await sql`
    WITH claimed AS (
      UPDATE device_authorizations SET status = 'consumed', token_id = ${tokenId}
      WHERE id = ${row.id} AND status = 'approved' AND expires_at > NOW()
      RETURNING client_name, scopes, approved_by
    )
    INSERT INTO api_tokens (id, name, owner_person_id, token_hash, scopes, expires_at)
    SELECT ${tokenId}, client_name, approved_by, ${hash}, scopes,
           NOW() + make_interval(days => ${DEVICE_TOKEN_TTL_DAYS})
    FROM claimed
    RETURNING id, owner_person_id, scopes, expires_at
  `
  const t: any = issued[0]
  if (!t) return deviceError(event, audit, 400, 'invalid_grant', 'the token was already issued')

  audit.tokenId = t.id
  audit.ownerPersonId = t.owner_person_id
  audit.summary.result = 'token_issued'
  return {
    access_token: token,
    token_type: 'Bearer',
    scopes: t.scopes,
    expires_at: new Date(t.expires_at).toISOString(),
  }
})
