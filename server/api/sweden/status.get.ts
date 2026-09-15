// Live numbers for the /sweden page: how big the pool is, how close it is to
// the gate that sets the first meeting, and what the Norwegian network looks
// like. Public and read-only; no names, no emails, only counts.

const SWEDEN_GROUP_SLUG = 'roundtable-sweden'
const NORWAY_GROUP_SLUG = 'cto-roundtable'

// Around ten names sets the first meeting; the founding room is 10 to 15,
// picked from the pool for the mix. Same numbers as the connector kit.
const SWEDEN_GATE = 10
const SWEDEN_ROOM_MIN = 10
const SWEDEN_ROOM_MAX = 15

export default defineCachedEventHandler(
  async () => {
    const sql = useDatabase()

    const [sweden] = await sql`
      SELECT
        count(*)::int AS signups,
        count(*) FILTER (WHERE jr.created_at > now() - interval '30 days')::int AS recent
      FROM join_requests jr
      JOIN network_groups ng ON ng.id = jr.group_id
      WHERE ng.slug = ${SWEDEN_GROUP_SLUG}
        AND jr.status IN ('pending', 'accepted')
    `

    const [norway] = await sql`
      SELECT count(*)::int AS members
      FROM memberships m
      JOIN network_groups ng ON ng.id = m.group_id
      WHERE ng.slug = ${NORWAY_GROUP_SLUG}
    `

    return {
      signups: sweden?.signups ?? 0,
      recent: sweden?.recent ?? 0,
      gate: SWEDEN_GATE,
      roomMin: SWEDEN_ROOM_MIN,
      roomMax: SWEDEN_ROOM_MAX,
      norwayMembers: norway?.members ?? 0,
    }
  },
  { maxAge: 60, name: 'sweden-status', getKey: () => 'sweden-status' },
)
