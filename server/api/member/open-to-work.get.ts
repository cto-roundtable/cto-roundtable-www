// GET /api/member/open-to-work
// The caller's own flag, or null when they are not listed (the default).
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()

  const rows = await sql`
    SELECT id, looking_for, availability, note, created_at, updated_at
    FROM open_to_work
    WHERE person_id = ${session.personId}
      AND status = 'open'
    LIMIT 1
  `

  const row = rows[0]
  if (!row) return null

  return {
    id: row.id,
    lookingFor: row.looking_for,
    availability: row.availability,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
})
