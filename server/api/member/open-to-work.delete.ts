// DELETE /api/member/open-to-work
// Opt out. The row is kept as history (status = 'closed') and drops off the list.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()

  await sql`
    UPDATE open_to_work
    SET status = 'closed',
        closed_at = NOW(),
        updated_at = NOW()
    WHERE person_id = ${session.personId}
      AND status = 'open'
  `

  return { ok: true }
})
