// POST /api/member/discounts/:id/request
// A member signals interest in a testing offer. Idempotent. Only testing offers
// accept requests (that is the demand-gathering state). Returns the live count.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const id = getRouterParam(event, 'id')
  const sql = useDatabase()

  const offer = await sql`SELECT status FROM member_offers WHERE id = ${id} LIMIT 1`
  if (offer.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Tilbudet finnes ikke' })
  }
  if (offer[0]!.status !== 'testing') {
    throw createError({ statusCode: 409, statusMessage: 'Dette tilbudet tar ikke imot forespørsler' })
  }

  await sql`
    INSERT INTO member_offer_requests (offer_id, person_id)
    VALUES (${id}, ${session.personId})
    ON CONFLICT (offer_id, person_id) DO NOTHING
  `

  const count = await sql`
    SELECT COUNT(*)::int AS c FROM member_offer_requests WHERE offer_id = ${id}
  `
  return { ok: true, requestCount: count[0]!.c, hasRequested: true }
})
