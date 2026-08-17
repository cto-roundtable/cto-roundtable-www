import type { H3Event } from 'h3'

// The gate for board-only surfaces is the `styret` Neon group, whose membership
// mirrors the styremøte calendar invitation.
//
// It used to be `braintrust`, which was wrong and only harmless while the single
// board surface was an activity report. Braintrust is an older, wider circle: it
// contained two people who are not on the styret and was missing one who is. Now
// that styremøte agendas and referater are served here, the gate has to be the
// actual board.
const BOARD_GROUP = 'styret'

/**
 * RBAC guard: allow only board members. Must run after the /api/member/
 * middleware, which sets event.context.session and already guarantees an active
 * cto-roundtable member. Throws 403 otherwise.
 * Returns the caller's personId for convenience.
 */
export async function requireBoard(event: H3Event): Promise<string> {
  const session = event.context.session
  if (!session?.personId) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  if (!(await isBoardMember(session.personId))) {
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
    WHERE m.person_id = ${personId} AND ng.slug = ${BOARD_GROUP}
    LIMIT 1
  `
  return rows.length > 0
}
