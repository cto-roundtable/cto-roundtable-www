/**
 * RBAC helpers for investor updates.
 *
 * Visibility is derived, never stored: a member may see an update iff they share
 * a network_group with one of the funding cohorts of that update's deal:
 *   investor_updates.deal_id -> investments.deal_id -> investments.group_id
 *   -> memberships.group_id  -> memberships.person_id
 * A company co-funded by several cohorts is visible to every funding cohort's
 * members. Membership changes take effect immediately (checked per request).
 */

/** Non-throwing check: does this person belong to any investment cohort? Used to
 *  decide whether to show the nav link. The page/API are independently gated. */
export async function isInvestorMember(personId: string): Promise<boolean> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT 1
    FROM memberships m
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE m.person_id = ${personId} AND ng.slug LIKE 'invest-%'
    LIMIT 1
  `
  return rows.length > 0
}

/**
 * Guard: throw 404 unless `personId` may see updates for `dealId` (i.e. a cohort
 * they belong to funded that deal). Returns silently when allowed. The 404 carries
 * the caller's own not-found message, so a company (or update, or attachment) the
 * member may not read answers exactly like one that does not exist, and a slug
 * cannot be probed for whether a deal or lead exists (the same rule as cases).
 */
export async function requireDealAccess(personId: string, dealId: string, notFound: string): Promise<void> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT 1
    FROM investments inv
    JOIN memberships m ON m.group_id = inv.group_id
    WHERE inv.deal_id = ${dealId} AND m.person_id = ${personId}
    LIMIT 1
  `
  if (rows.length === 0) {
    throw createError({ statusCode: 404, message: notFound })
  }
}
