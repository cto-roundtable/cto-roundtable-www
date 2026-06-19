// DELETE /api/member/discounts/:id/request
// Withdraw a previously signalled interest in a testing offer.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const id = getRouterParam(event, 'id')
  const sql = useDatabase()

  await sql`
    DELETE FROM member_offer_requests
    WHERE offer_id = ${id} AND person_id = ${session.personId}
  `

  const count = await sql`
    SELECT COUNT(*)::int AS c FROM member_offer_requests WHERE offer_id = ${id}
  `
  return { ok: true, requestCount: count[0]!.c, hasRequested: false }
})
