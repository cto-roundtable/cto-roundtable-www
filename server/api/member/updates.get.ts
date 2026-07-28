// GET /api/member/updates
// Chronological feed of investor updates for the portfolio companies the caller's
// cohort(s) funded. Cohort-scoped via the subquery (deal_id -> investments ->
// memberships) and paginated (default newest 20, load more via ?offset). An
// optional ?slug narrows the feed to a single company. Returns list metadata only
// (no body) so the overview page stays light; full body + attachments come from
// /api/member/updates/[slug].
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()
  const personId = session.personId

  const q = getQuery(event)
  const limit = Math.min(Math.max(Number.parseInt(String(q.limit ?? '20'), 10) || 20, 1), 50)
  const offset = Math.max(Number.parseInt(String(q.offset ?? '0'), 10) || 0, 0)
  const slug = typeof q.slug === 'string' && q.slug.trim() ? q.slug.trim() : null

  // Paginated feed of individual updates, newest first, cohort-scoped. The optional
  // slug narrows to one company; the cohort subquery still gates visibility either way.
  const rows = slug
    ? await sql`
        SELECT u.id, pd.slug, o.name AS company,
               u.kind, u.update_date, u.title, u.headline
        FROM investor_updates u
        JOIN pipeline_deals pd ON pd.id = u.deal_id
        JOIN organizations o   ON o.id = pd.organization_id
        WHERE pd.slug = ${slug}
          AND u.deal_id IN (
            SELECT inv.deal_id
            FROM investments inv
            JOIN memberships m ON m.group_id = inv.group_id
            WHERE m.person_id = ${personId}
          )
        ORDER BY u.update_date DESC, u.ingested_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT u.id, pd.slug, o.name AS company,
               u.kind, u.update_date, u.title, u.headline
        FROM investor_updates u
        JOIN pipeline_deals pd ON pd.id = u.deal_id
        JOIN organizations o   ON o.id = pd.organization_id
        WHERE u.deal_id IN (
          SELECT inv.deal_id
          FROM investments inv
          JOIN memberships m ON m.group_id = inv.group_id
          WHERE m.person_id = ${personId}
        )
        ORDER BY u.update_date DESC, u.ingested_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `

  // Total matching the current filter, so the client knows when to stop loading.
  const countRows = slug
    ? await sql`
        SELECT COUNT(*)::int AS n
        FROM investor_updates u
        JOIN pipeline_deals pd ON pd.id = u.deal_id
        WHERE pd.slug = ${slug}
          AND u.deal_id IN (
            SELECT inv.deal_id
            FROM investments inv
            JOIN memberships m ON m.group_id = inv.group_id
            WHERE m.person_id = ${personId}
          )
      `
    : await sql`
        SELECT COUNT(*)::int AS n
        FROM investor_updates u
        WHERE u.deal_id IN (
          SELECT inv.deal_id
          FROM investments inv
          JOIN memberships m ON m.group_id = inv.group_id
          WHERE m.person_id = ${personId}
        )
      `
  const total = (countRows as any[])[0]?.n ?? 0

  // Visible companies that have at least one update — powers the filter dropdown and
  // the per-company cohort chips. array_agg lists every funding cohort of the deal.
  const companyRows = await sql`
    SELECT pd.slug, o.name AS company,
           array_agg(DISTINCT ng.name ORDER BY ng.name) AS cohorts
    FROM pipeline_deals pd
    JOIN organizations o    ON o.id = pd.organization_id
    JOIN investments inv    ON inv.deal_id = pd.id
    JOIN network_groups ng  ON ng.id = inv.group_id
    WHERE pd.id IN (
      SELECT inv.deal_id
      FROM investments inv
      JOIN memberships m ON m.group_id = inv.group_id
      WHERE m.person_id = ${personId}
    )
    AND EXISTS (SELECT 1 FROM investor_updates u WHERE u.deal_id = pd.id)
    GROUP BY pd.slug, o.name
    ORDER BY o.name
  `
  const cohortsBySlug: Record<string, string[]> = {}
  for (const r of companyRows as any[]) cohortsBySlug[r.slug] = r.cohorts

  // The caller's own investment groups, for the "you're in" pills at the top.
  const memberCohortRows = await sql`
    SELECT ng.name
    FROM memberships m
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE m.person_id = ${personId} AND ng.slug LIKE 'invest-%'
    ORDER BY ng.slug
  `

  return {
    memberCohorts: (memberCohortRows as any[]).map((r) => r.name),
    companies: (companyRows as any[]).map((r) => ({ slug: r.slug, company: r.company })),
    total,
    hasMore: offset + (rows as any[]).length < total,
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
