export default defineEventHandler(async (event) => {
  const session = event.context.session
  const sql = useDatabase()

  // Get member details with group memberships
  const memberships = await sql`
    SELECT ng.name as group_name, ng.slug, m.role, m.created_at as joined_at
    FROM memberships m
    JOIN network_groups ng ON m.group_id = ng.id
    WHERE m.person_id = ${session.personId}
    ORDER BY m.created_at
  `

  const person = await sql`
    SELECT p.name, p.status, p.created_at
    FROM persons p
    WHERE p.id = ${session.personId}
    LIMIT 1
  `

  if (person.length === 0) {
    throw createError({ statusCode: 404, message: 'Member not found' })
  }

  return {
    name: person[0]!.name,
    status: person[0]!.status,
    memberSince: person[0]!.created_at,
    memberships: memberships.map((m: any) => ({
      group: m.group_name,
      slug: m.slug,
      role: m.role,
      joinedAt: m.joined_at,
    })),
  }
})
