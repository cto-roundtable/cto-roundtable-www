const sortStrategies: Record<string, (a: any, b: any) => number> = {
  name: (a, b) => a.company.localeCompare(b.company),
  date: (a, b) => new Date(a.invested_at).getTime() - new Date(b.invested_at).getTime(),
}

const validSorts = new Set(Object.keys(sortStrategies))

// Public endpoint (rendered on the marketing /investment page). It deliberately
// exposes only the portfolio company + link. Invested amounts and the fund /
// cohort name are confidential and must never leave the server here; keep them
// out of both the SQL projection and the response.
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sql = useDatabase()

  const rows = await sql`
    SELECT
      o.name AS company,
      o.website AS url,
      MIN(i.invested_at) AS invested_at
    FROM investments i
    INNER JOIN pipeline_deals pd ON i.deal_id = pd.id
    INNER JOIN organizations o ON pd.organization_id = o.id
    GROUP BY pd.id, o.name, o.website
    ORDER BY MIN(i.invested_at) ASC
  `

  const sortKey = typeof query.sort === 'string' && validSorts.has(query.sort) ? query.sort : 'date'
  const sorted = [...rows].sort(sortStrategies[sortKey])

  return {
    sort: sortKey,
    investments: sorted.map((row: any) => ({
      company: row.company as string,
      url: (row.url || '') as string,
    })),
  }
})
