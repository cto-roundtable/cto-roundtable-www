// GET /api/member/board/members
// Board-only list of the styret, for choosing who signs a protocol.
//
// Reads the same Neon group the gate reads, so the people offered as signers are
// exactly the people allowed to be signers. Vedtak 4 needs two of them, and the
// portal has no other place that names the board.
export default defineEventHandler(async (event) => {
  await requireBoard(event)
  const sql = useDatabase()

  const rows = await sql`
    SELECT p.id, p.name
    FROM persons p
    JOIN memberships m ON m.person_id = p.id
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE ng.slug = ${BOARD_GROUP} AND p.status = 'active'
    ORDER BY p.name
  `

  return { members: rows.map((r: any) => ({ id: r.id, name: r.name })) }
})
