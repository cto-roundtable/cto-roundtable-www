// GET /api/member/discounts
// Member product discount package. Visibility by status:
//   active/testing -> all signed-in members
//   pending        -> board only (braintrust group)
// Discount codes are only exposed for active offers. Testing offers carry a
// demand signal (request_count / has_requested) instead of a code.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()

  const board = await sql`
    SELECT 1
    FROM memberships m
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE m.person_id = ${session.personId} AND ng.slug = 'braintrust'
    LIMIT 1
  `
  const isBoard = board.length > 0

  const visibleStatuses = isBoard ? ['active', 'testing', 'pending'] : ['active', 'testing']

  const rows = await sql`
    SELECT
      mo.id, mo.title, mo.terms, mo.code, mo.redemption_url,
      mo.status, mo.valid_until, mo.notes,
      o.name AS company, o.website,
      p.name AS contact_name,
      COUNT(req.id)::int AS request_count,
      BOOL_OR(req.person_id = ${session.personId}) AS has_requested
    FROM member_offers mo
    JOIN organizations o ON o.id = mo.organization_id
    LEFT JOIN persons p ON p.id = mo.contact_person_id
    LEFT JOIN member_offer_requests req ON req.offer_id = mo.id
    WHERE mo.status = ANY(${visibleStatuses})
    GROUP BY mo.id, o.name, o.website, p.name
    ORDER BY
      CASE mo.status
        WHEN 'active' THEN 0 WHEN 'testing' THEN 1 WHEN 'pending' THEN 2 ELSE 3
      END,
      o.name
  `

  return {
    isBoard,
    offers: rows.map((r: any) => ({
      id: r.id,
      company: r.company,
      website: r.website,
      title: r.title,
      terms: r.terms,
      code: r.status === 'active' ? r.code : null,
      redemptionUrl: r.redemption_url,
      status: r.status,
      validUntil: r.valid_until,
      contactName: r.contact_name,
      requestCount: r.request_count,
      hasRequested: Boolean(r.has_requested),
      // Internal context (may hold negotiation notes) stays board-only.
      notes: isBoard ? r.notes : null,
    })),
  }
})
