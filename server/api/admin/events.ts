// GET /api/admin/events?from=YYYY-MM-DD&to=YYYY-MM-DD&group=<slug>&limit=N
// Network events, newest first, with the organising group. `ctr events ls`.
// Defaults: no date bounds, every group, 20 rows (max 200).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function dateParam(value: unknown, name: string): string | null {
  if (value === undefined || value === '') return null
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw createError({ statusCode: 400, message: `${name} must be YYYY-MM-DD` })
  }
  return value
}

export default defineAdminRoute({
  GET: {
    scope: 'events:read',
    handler: async (event, _caller, audit) => {
      const q = getQuery(event)
      const from = dateParam(q.from, 'from')
      const to = dateParam(q.to, 'to')
      const group = typeof q.group === 'string' && q.group ? q.group : null
      const limit = q.limit === undefined ? 20 : Number(q.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw createError({ statusCode: 400, message: 'limit must be 1 to 200' })
      }

      const sql = useDatabase()
      const rows = await sql`
        SELECT e.id, to_char(e.date, 'YYYY-MM-DD') AS date, e.theme, e.location, e.luma_url,
               ng.slug AS group_slug, ng.name AS group_name
        FROM events e
        LEFT JOIN network_groups ng ON ng.id = e.group_id
        WHERE (${from}::date IS NULL OR e.date >= ${from}::date)
          AND (${to}::date IS NULL OR e.date <= ${to}::date)
          AND (${group}::text IS NULL OR ng.slug = ${group})
        ORDER BY e.date DESC NULLS LAST, e.created_at DESC
        LIMIT ${limit}
      `
      audit.summary.count = rows.length
      return {
        events: rows.map((r: any) => ({
          id: r.id,
          date: r.date,
          theme: r.theme,
          location: r.location,
          lumaUrl: r.luma_url,
          group: r.group_slug ? { slug: r.group_slug, name: r.group_name } : null,
        })),
      }
    },
  },
})
