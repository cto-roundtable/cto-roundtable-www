import type { H3Event } from 'h3'

/**
 * RBAC for the open-to-work list (/member/jobb).
 *
 * Any member may flag themselves (that only touches their own row). Reading who
 * else is open is for the people who get asked "do you know a CTO for X": the
 * investment cohorts (invest-*), since founders reach out through the invest
 * side, plus the board (styret), who run the network. Checked per request, so a
 * membership change takes effect immediately.
 */
export async function canSeeOpenToWork(personId: string): Promise<boolean> {
  const [investor, board] = await Promise.all([isInvestorMember(personId), isBoardMember(personId)])
  return investor || board
}

/**
 * Guard: throw 403 unless the caller may read the list. Must run after the
 * /api/member/ middleware, which sets event.context.session.
 */
export async function requireOpenToWorkViewer(event: H3Event): Promise<string> {
  const session = event.context.session
  if (!session?.personId) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  if (!(await canSeeOpenToWork(session.personId))) {
    throw createError({ statusCode: 403, message: 'Investment cohorts and board only' })
  }
  return session.personId
}
