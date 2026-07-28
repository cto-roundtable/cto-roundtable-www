// GET /api/member/updates/attachment/:id
// Streams a single investor-update attachment from GCS to the member, after a
// cohort check on the owning update's deal. Proxying (not signed URLs) keeps
// access re-checked on every request — no shareable long-lived link escapes the
// cohort.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing attachment' })

  const sql = useDatabase()
  const rows = await sql`
    SELECT a.object_key, a.filename, a.mime, u.deal_id
    FROM investor_update_attachments a
    JOIN investor_updates u ON u.id = a.update_id
    WHERE a.id = ${id}
    LIMIT 1
  `
  if (rows.length === 0) throw createError({ statusCode: 404, message: 'Attachment not found' })
  const att = rows[0]!

  // RBAC: same gate as the update it belongs to.
  await requireDealAccess(session.personId, att.deal_id)

  const obj = await readInvestorUpdateObject(att.object_key)

  setHeader(event, 'Content-Type', att.mime || obj.contentType)
  setHeader(event, 'Content-Disposition', `inline; filename="${att.filename.replace(/"/g, '')}"`)
  // Private, member-scoped content: never let a shared/CDN cache hold it.
  setHeader(event, 'Cache-Control', 'private, no-store')
  return obj.data
})
