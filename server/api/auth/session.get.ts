export default defineEventHandler(async (event) => {
  const session = verifySession(event)

  if (!session) {
    return { authenticated: false }
  }

  const sql = useDatabase()
  const rows = await sql`
    SELECT value
    FROM contact_infos
    WHERE person_id = ${session.personId} AND type = 'email'
    ORDER BY is_primary DESC
    LIMIT 1
  `
  const email = rows[0]?.value ?? null

  return {
    authenticated: true,
    name: session.name,
    personId: session.personId,
    email,
    isBoard: await isBoardMember(session.personId),
    isInvestor: await isInvestorMember(session.personId),
  }
})
