// GET /api/member/updates
// Investor updates for the portfolio companies the caller's cohort(s) funded.
// Cohort-scoped via the subquery (deal_id -> investments -> memberships); returns
// list metadata only (no body) so the overview page stays light. Full body +
// attachments come from /api/member/updates/[slug].
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()

  const rows = await sql`
    SELECT
      u.id, u.deal_id, pd.slug, o.name AS company,
      u.kind, u.update_date, u.title, u.headline
    FROM investor_updates u
    JOIN pipeline_deals pd ON pd.id = u.deal_id
    JOIN organizations o   ON o.id = pd.organization_id
    WHERE u.deal_id IN (
      SELECT inv.deal_id
      FROM investments inv
      JOIN memberships m ON m.group_id = inv.group_id
      WHERE m.person_id = ${session.personId}
    )
    ORDER BY u.update_date DESC, o.name
  `

  // Funding cohorts per visible company (for labels/grouping).
  const cohortRows = await sql`
    SELECT pd.slug, array_agg(DISTINCT ng.name ORDER BY ng.name) AS cohorts
    FROM pipeline_deals pd
    JOIN investments inv ON inv.deal_id = pd.id
    JOIN network_groups ng ON ng.id = inv.group_id
    WHERE pd.id IN (
      SELECT inv.deal_id
      FROM investments inv
      JOIN memberships m ON m.group_id = inv.group_id
      WHERE m.person_id = ${session.personId}
    )
    GROUP BY pd.slug
  `
  const cohortsBySlug: Record<string, string[]> = {}
  for (const r of cohortRows as any[]) cohortsBySlug[r.slug] = r.cohorts

  return {
    updates: (rows as any[]).map((r) => ({
      id: r.id,
      slug: r.slug,
      company: r.company,
      cohorts: cohortsBySlug[r.slug] ?? [],
      kind: r.kind,
      updateDate: r.update_date,
      title: r.title,
      headline: r.headline,
    })),
  }
})
