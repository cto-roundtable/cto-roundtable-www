export default defineEventHandler(async () => {
  const sql = useDatabase()

  const rows = await sql`
    SELECT
      o.name AS company,
      o.website AS url,
      ng.name AS fund,
      i.amount_nok,
      i.created_at
    FROM investments i
    INNER JOIN pipeline_deals pd ON i.deal_id = pd.id
    INNER JOIN organizations o ON pd.organization_id = o.id
    INNER JOIN network_groups ng ON i.group_id = ng.id
    ORDER BY i.created_at ASC
  `

  return {
    investments: rows.map((row: any) => ({
      company: row.company,
      url: row.url || '',
      fund: row.fund,
      amountNok: row.amount_nok,
    })),
  }
})
