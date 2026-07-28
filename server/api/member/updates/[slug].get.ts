// GET /api/member/updates/:slug
// Full update history (with body + attachment metadata) for one portfolio company,
// gated so only members of a funding cohort can read it. Attachment BYTES are not
// returned here — the page links to /api/member/updates/attachment/:id.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, message: 'Missing company' })

  const sql = useDatabase()

  const deal = await sql`
    SELECT pd.id AS deal_id, o.name AS company
    FROM pipeline_deals pd
    JOIN organizations o ON o.id = pd.organization_id
    WHERE pd.slug = ${slug}
    LIMIT 1
  `
  if (deal.length === 0) throw createError({ statusCode: 404, message: 'Company not found' })
  const dealId = deal[0]!.deal_id

  // RBAC: caller must belong to a cohort that funded this deal.
  await requireDealAccess(session.personId, dealId)

  const updates = await sql`
    SELECT id, kind, update_date, title, headline, body_md, summary_md
    FROM investor_updates
    WHERE deal_id = ${dealId}
    ORDER BY update_date DESC, ingested_at DESC
  `

  const updateIds = (updates as any[]).map((u) => u.id)
  const attachments = updateIds.length
    ? await sql`
        SELECT id, update_id, filename, mime, size_bytes
        FROM investor_update_attachments
        WHERE update_id = ANY(${updateIds})
        ORDER BY filename
      `
    : []
  const attachmentsByUpdate: Record<string, any[]> = {}
  for (const a of attachments as any[]) {
    if (!attachmentsByUpdate[a.update_id]) attachmentsByUpdate[a.update_id] = []
    attachmentsByUpdate[a.update_id].push({
      id: a.id,
      filename: a.filename,
      mime: a.mime,
      sizeBytes: a.size_bytes,
    })
  }

  return {
    company: deal[0]!.company,
    slug,
    updates: (updates as any[]).map((u) => ({
      id: u.id,
      kind: u.kind,
      updateDate: u.update_date,
      title: u.title,
      headline: u.headline,
      bodyMd: u.body_md,
      summaryMd: u.summary_md,
      attachments: attachmentsByUpdate[u.id] ?? [],
    })),
  }
})
