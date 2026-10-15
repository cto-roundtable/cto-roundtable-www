export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''

  if (!token) {
    return sendRedirect(event, '/member?error=invalid')
  }

  const sql = useDatabase()

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
  issueSession(event, record.person_id, record.name)

  // via=link tells the portal this was a mail sign-in, so a member without a
  // passkey can be offered one (onboarding step on /member/security).
  return sendRedirect(event, '/member?via=link')
})
