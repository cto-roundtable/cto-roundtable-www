import type { H3Event } from 'h3'

// The gate for committee-only surfaces is the `current-komite` Neon group: the
// investment committee that recommends deals to the SPVs. It is not the board
// (`styret`, server/utils/board.ts): the two overlap today but answer for
// different things. The committee sees named ballots, who asked a question and
// who wrote a comment (decision 2026-10-22, vote model, in the ctori-4 project).
export const COMMITTEE_GROUP = 'current-komite'

/** Non-throwing committee check, for endpoints that vary output by role. */
export async function isCommitteeMember(personId: string): Promise<boolean> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT 1
    FROM memberships m
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE m.person_id = ${personId} AND ng.slug = ${COMMITTEE_GROUP}
    LIMIT 1
  `
  return rows.length > 0
}

/**
 * RBAC guard: allow only committee members. Must run after the /api/member/
 * middleware, which sets event.context.session. Throws 403 otherwise.
 * Returns the caller's personId for convenience.
 */
export async function requireCommittee(event: H3Event): Promise<string> {
  const session = event.context.session
  if (!session?.personId) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  if (!(await isCommitteeMember(session.personId))) {
    throw createError({ statusCode: 403, message: 'Committee only' })
  }
  return session.personId
}
