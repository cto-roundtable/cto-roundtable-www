export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()

  await sql`
    UPDATE event_locations
    SET status = 'withdrawn',
        withdrawn_at = NOW()
    WHERE registered_by = ${session.personId}
      AND status = 'open'
  `

  return { ok: true }
})
