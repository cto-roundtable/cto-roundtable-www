// GET /api/member/board/activity?days=365
// Board-only (braintrust) member-activity picture over a rolling window.
// Feeds the styret's "flag inactive members" work. Reads the activity_events
// signal layer (Slack messages/reactions + Luma attendance/hosting).
//
// Universe = all ACTIVE cto-roundtable members (LEFT JOIN activity), so members
// with zero signals in the window are included: those are the ones to flag.
//
// Score weights mirror the report shared with the board:
//   post (thread start) = 3, thread reply = 2, reaction = 1,
//   attended = 5, hosted = 8.
// A Slack 'message' is a top-level post unless payload.is_reply is true.
// Backfilled rows without is_reply are treated as posts (the common case).
const LOW_SCORE = 5 // below this, and no event attendance, counts as "low"

export default defineEventHandler(async (event) => {
  await requireBoard(event)
  const sql = useDatabase()

  const q = getQuery(event)
  const days = Math.min(Math.max(Number.parseInt(String(q.days ?? '365'), 10) || 365, 7), 365)

  const rows = await sql`
    WITH act AS (
      SELECT person_id,
        count(*) FILTER (WHERE event_type = 'message'
          AND COALESCE(payload->>'is_reply', 'false') <> 'true')  AS posts,
        count(*) FILTER (WHERE event_type = 'message'
          AND payload->>'is_reply' = 'true')                      AS replies,
        count(*) FILTER (WHERE event_type = 'reaction_added')     AS reactions,
        count(*) FILTER (WHERE event_type = 'event_attended')     AS attended,
        count(*) FILTER (WHERE event_type = 'event_hosted')       AS hosted,
        max(occurred_at) AS last_seen
      FROM activity_events
      WHERE person_id IS NOT NULL
        AND occurred_at >= now() - make_interval(days => ${days})
      GROUP BY person_id
    ),
    ever AS (
      SELECT person_id, max(occurred_at) AS last_ever
      FROM activity_events WHERE person_id IS NOT NULL GROUP BY person_id
    )
    SELECT
      p.id, p.name,
      COALESCE(a.posts, 0)     AS posts,
      COALESCE(a.replies, 0)   AS replies,
      COALESCE(a.reactions, 0) AS reactions,
      COALESCE(a.attended, 0)  AS attended,
      COALESCE(a.hosted, 0)    AS hosted,
      a.last_seen,
      e.last_ever,
      (COALESCE(a.posts,0) * 3 + COALESCE(a.replies,0) * 2 + COALESCE(a.reactions,0)
        + COALESCE(a.attended,0) * 5 + COALESCE(a.hosted,0) * 8) AS score
    FROM persons p
    JOIN memberships m    ON m.person_id = p.id
    JOIN network_groups g ON g.id = m.group_id AND g.slug = 'cto-roundtable'
    LEFT JOIN act a  ON a.person_id = p.id
    LEFT JOIN ever e ON e.person_id = p.id
    WHERE p.status = 'active'
    ORDER BY score ASC, e.last_ever ASC NULLS FIRST, p.name
  `

  const members = rows.map((r: any) => {
    const posts = Number(r.posts)
    const replies = Number(r.replies)
    const reactions = Number(r.reactions)
    const attended = Number(r.attended)
    const hosted = Number(r.hosted)
    const score = Number(r.score)
    const showsUp = attended + hosted
    const status = score === 0 ? 'dormant' : showsUp === 0 && score < LOW_SCORE ? 'low' : 'active'
    return {
      personId: r.id,
      name: r.name,
      posts,
      replies,
      reactions,
      attended,
      hosted,
      slackTotal: posts + replies + reactions,
      showsUp,
      score,
      status,
      lastSeen: r.last_seen,
      lastEver: r.last_ever,
    }
  })

  const summary = {
    total: members.length,
    dormant: members.filter((m) => m.status === 'dormant').length,
    low: members.filter((m) => m.status === 'low').length,
    active: members.filter((m) => m.status === 'active').length,
  }

  return {
    windowDays: days,
    generatedAt: new Date().toISOString(),
    weights: { post: 3, reply: 2, reaction: 1, attended: 5, hosted: 8 },
    // Slack has a coverage gap: our live webhook started 2026-06-30, and the
    // Riff backfill ended 2026-03-01, so windows spanning Mar-Jun 2026 undercount
    // Slack. Attendance/hosting (Luma) is complete. Flags get reliable as live
    // Slack accumulates; treat "dormant/low" as directional for now.
    coverageNote:
      'Slack er komplett fra 2026-06-30 (live webhook). Eldre Slack finnes til 2026-03-01, med et hull mar-jun. Oppmøte/hosting er komplett. Flagg er retningsgivende inntil vinduet er fullt dekket.',
    summary,
    members,
  }
})
