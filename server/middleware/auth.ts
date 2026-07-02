export default defineEventHandler(async (event) => {
  // Only protect member-specific API routes. The /member page itself handles
  // auth client-side; this middleware attaches session data for server routes.
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/member/')) return

  const session = verifySession(event)
  if (!session) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // The session cookie is a stateless 30-day bearer token, so re-validate it
  // against the live database on every request. Without this a member who is
  // deactivated or removed from the network would keep member-portal access
  // until the cookie expires. This mirrors the gate in /api/auth/request
  // (active person + cto-roundtable membership), so a session is valid exactly
  // as long as the holder could obtain a fresh one.
  const sql = useDatabase()
  const rows = await sql`
    SELECT 1
    FROM persons p
    JOIN memberships m ON m.person_id = p.id
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE p.id = ${session.personId}
      AND p.status = 'active'
      AND ng.slug = 'cto-roundtable'
    LIMIT 1
  `
  if (rows.length === 0) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // Attach session to event context for downstream handlers
  event.context.session = session
})
