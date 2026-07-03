import type { H3Event } from 'h3'

/**
 * RBAC guard: allow only board members (the `braintrust` Neon group, aka styret).
 * Must run after the /api/member/ middleware, which sets event.context.session
 * and already guarantees an active cto-roundtable member. Throws 403 otherwise.
 * Returns the caller's personId for convenience.
 */
export async function requireBoard(event: H3Event): Promise<string> {
  const session = event.context.session
  if (!session?.personId) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  const sql = useDatabase()
  const rows = await sql`
    SELECT 1
    FROM memberships m
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE m.person_id = ${session.personId} AND ng.slug = 'braintrust'
    LIMIT 1
  `
  if (rows.length === 0) {
    throw createError({ statusCode: 403, message: 'Board only' })
  }
  return session.personId
}

/** Non-throwing board check, for endpoints that vary output by role. */
export async function isBoardMember(personId: string): Promise<boolean> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT 1
    FROM memberships m
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE m.person_id = ${personId} AND ng.slug = 'braintrust'
    LIMIT 1
  `
  return rows.length > 0
}
