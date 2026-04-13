export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''

  if (!token) {
    return sendRedirect(event, '/member?error=invalid')
  }

  const sql = useDatabase()
  const config = useRuntimeConfig()

  // Atomically validate and consume token (prevents race condition on reuse)
  const tokens = await sql`
    UPDATE auth_tokens SET used_at = now()
    WHERE id = (
      SELECT at.id FROM auth_tokens at
      WHERE at.token = ${token}
        AND at.expires_at > now()
        AND at.used_at IS NULL
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING person_id, (SELECT name FROM persons WHERE id = auth_tokens.person_id) as name
  `

  if (tokens.length === 0) {
    return sendRedirect(event, '/member?error=expired')
  }

  const record = tokens[0]!

  // Create session payload
  const session = JSON.stringify({
    personId: record.person_id,
    name: record.name,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  })

  // Set signed session cookie
  setCookie(event, 'ctr_session', session, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
  })

  // Set HMAC signature cookie
  const hmac = createSessionHmac(session, config.sessionSecret)
  setCookie(event, 'ctr_session_sig', hmac, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  return sendRedirect(event, '/member')
})
