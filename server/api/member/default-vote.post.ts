// POST /api/member/default-vote  { group: <invest group slug>, blank: boolean }
// The member's own standing vote in one SPV (memberships.default_vote, migration 032):
// "Hvis jeg ikke stemmer, regn meg som blank", on or off. Blank or nothing, never yes
// (voting-process.md §4.2: a standing yes would be a proxy to the committee); the CHECK
// in 032 refuses anything else too. Every change lands in audit_log (032's trigger).
// A round freezes each member's setting into its roster when it opens, so a change
// counts from the next vote that opens.
export default defineEventHandler(async (event) => {
  const session = event.context.session
  const body = await readBody<{ group?: unknown; blank?: unknown }>(event)
  if (typeof body?.group !== 'string' || typeof body?.blank !== 'boolean') {
    throw createError({ statusCode: 400, message: 'Expected { group: string, blank: boolean }' })
  }
  const sql = useDatabase()
  const rows = (await sql`
    UPDATE memberships m SET default_vote = ${body.blank ? 'blank' : null}
    FROM network_groups g
    WHERE g.id = m.group_id AND g.slug = ${body.group} AND g.invest_phase IS NOT NULL
      AND m.person_id = ${session.personId}
    RETURNING m.default_vote
  `) as any[]
  // Not an SPV this member is in: the same answer as no such group.
  if (!rows.length) throw createError({ statusCode: 404, message: 'Membership not found' })
  return { group: body.group, defaultVote: rows[0].default_vote }
})
