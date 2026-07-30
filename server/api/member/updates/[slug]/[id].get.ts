// GET /api/member/updates/:slug/:id
// A single investor update (body + attachment metadata) as its own resource, gated
// so only members of a funding cohort can read it. The slug is validated against the
// update so the URL is canonical (a mismatched slug/id 404s rather than silently
// resolving). Attachment bytes come from /api/member/updates/attachment/:id.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const slug = getRouterParam(event, 'slug')
  const id = getRouterParam(event, 'id')
  if (!slug || !id) throw createError({ statusCode: 400, message: 'Missing update' })

  const sql = useDatabase()

  const rows = await sql`
    SELECT u.id, u.deal_id, pd.slug, o.name AS company,
           u.kind, u.update_date, u.title, u.headline, u.body_md, u.summary_md
    FROM investor_updates u
    JOIN pipeline_deals pd ON pd.id = u.deal_id
    JOIN organizations o   ON o.id = pd.organization_id
    WHERE u.id = ${id} AND pd.slug = ${slug}
    LIMIT 1
  `
  if (rows.length === 0) throw createError({ statusCode: 404, message: 'Update not found' })
  const u = (rows as any[])[0]

  // RBAC: caller must belong to a cohort that funded this deal.
  await requireDealAccess(session.personId, u.deal_id)

  const attachments = await sql`
    SELECT id, filename, mime, size_bytes
    FROM investor_update_attachments
    WHERE update_id = ${id}
    ORDER BY filename
  `

  return {
    company: u.company,
    slug: u.slug,
    update: {
      id: u.id,
      kind: u.kind,
      updateDate: u.update_date,
      title: u.title,
      headline: u.headline,
      bodyMd: u.body_md,
      summaryMd: u.summary_md,
      attachments: (attachments as any[]).map((a) => ({
        id: a.id,
        filename: a.filename,
        mime: a.mime,
        sizeBytes: a.size_bytes,
      })),
    },
  }
})
