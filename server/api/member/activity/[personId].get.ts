// GET /api/member/activity/:personId?days=365&view=board
// Per-member activity detail. Powers both the board drawer (any member) and the
// member's own "Min aktivitet" page (self only).
//
// Access: you can always read your OWN detail; the board (braintrust) can read
// anyone's. A non-board member requesting someone else gets 403.
//
// The dormant/low/active STATUS flag is a board triage tool, not a self scorecard,
// so it is returned only for the board view (view=board by a board member). The
// self page never receives it.
//
// Score weights mirror the board list: post=3, reply=2, reaction=1, attended=5,
// hosted=8. A Slack 'message' is a post unless payload.is_reply is true.
const W = { post: 3, reply: 2, reaction: 1, attended: 5, hosted: 8 }
const LOW_SCORE = 5

export default defineEventHandler(async (event) => {
  const session = event.context.session // set by /api/member middleware
  const personId = getRouterParam(event, 'personId')
  if (!personId) throw createError({ statusCode: 400, message: 'Missing personId' })

  const isSelf = personId === session.personId
  const viewerIsBoard = await isBoardMember(session.personId)
  if (!isSelf && !viewerIsBoard) {
    throw createError({ statusCode: 403, message: 'Not allowed' })
  }
  // Status only in the explicit board view, and only for an actual board member.
  const boardView = getQuery(event).view === 'board' && viewerIsBoard

  const sql = useDatabase()
  const q = getQuery(event)
  const days = Math.min(Math.max(Number.parseInt(String(q.days ?? '365'), 10) || 365, 7), 365)

  const nameRows = await sql`SELECT name FROM persons WHERE id = ${personId} LIMIT 1`
  if (nameRows.length === 0) throw createError({ statusCode: 404, message: 'Not found' })

  const [summary] = await sql`
    SELECT
      count(*) FILTER (WHERE event_type='message'
        AND COALESCE(payload->>'is_reply','false') <> 'true')  AS posts,
      count(*) FILTER (WHERE event_type='message'
        AND payload->>'is_reply' = 'true')                     AS replies,
      count(*) FILTER (WHERE event_type='reaction_added')      AS reactions,
      count(*) FILTER (WHERE event_type='event_attended')      AS attended,
      count(*) FILTER (WHERE event_type='event_hosted')        AS hosted,
      min(occurred_at) AS first_seen,
      max(occurred_at) AS last_seen
    FROM activity_events
    WHERE person_id = ${personId}
      AND occurred_at >= now() - make_interval(days => ${days})
  `

  const weekly = await sql`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', now() - make_interval(days => ${days})),
        date_trunc('week', now()),
        interval '1 week'
      ) AS wk
    ),
    agg AS (
      SELECT date_trunc('week', occurred_at) AS wk,
        count(*) FILTER (WHERE event_type='message'
          AND COALESCE(payload->>'is_reply','false') <> 'true') AS posts,
        count(*) FILTER (WHERE event_type='message'
          AND payload->>'is_reply' = 'true')                    AS replies,
        count(*) FILTER (WHERE event_type='reaction_added')     AS reactions
      FROM activity_events
      WHERE person_id = ${personId} AND source = 'slack'
        AND occurred_at >= now() - make_interval(days => ${days})
      GROUP BY 1
    )
    SELECT w.wk AS week,
      COALESCE(a.posts,0)::int     AS posts,
      COALESCE(a.replies,0)::int   AS replies,
      COALESCE(a.reactions,0)::int AS reactions
    FROM weeks w LEFT JOIN agg a ON a.wk = w.wk
    ORDER BY w.wk
  `

  const eventRows = await sql`
    SELECT channel_name AS title, occurred_at AS at,
      CASE WHEN event_type='event_hosted' THEN 'hosted' ELSE 'attended' END AS role
    FROM activity_events
    WHERE person_id = ${personId}
      AND event_type IN ('event_attended','event_hosted')
      AND occurred_at >= now() - make_interval(days => ${days})
    ORDER BY occurred_at DESC
  `

  const emojiRows = await sql`
    SELECT payload->>'emoji' AS emoji, count(*)::int AS n
    FROM activity_events
    WHERE target_person_id = ${personId} AND event_type='reaction_added'
      AND occurred_at >= now() - make_interval(days => ${days})
    GROUP BY 1 ORDER BY n DESC
  `

  const channelRows = await sql`
    SELECT channel_name AS name, count(*)::int AS n
    FROM activity_events
    WHERE person_id = ${personId} AND source='slack' AND channel_name IS NOT NULL
      AND occurred_at >= now() - make_interval(days => ${days})
    GROUP BY 1 ORDER BY n DESC LIMIT 5
  `

  const posts = Number(summary.posts)
  const replies = Number(summary.replies)
  const reactions = Number(summary.reactions)
  const attended = Number(summary.attended)
  const hosted = Number(summary.hosted)

  const points = {
    posts: posts * W.post,
    replies: replies * W.reply,
    reactions: reactions * W.reaction,
    attended: attended * W.attended,
    hosted: hosted * W.hosted,
  }
  const score = points.posts + points.replies + points.reactions + points.attended + points.hosted

  const messages = posts + replies
  const activeWeeks = weekly.filter((w: any) => w.posts + w.replies > 0).length
  const messagesPerActiveWeek = activeWeeks > 0 ? Math.round((messages / activeWeeks) * 10) / 10 : 0

  const reactionsReceived = emojiRows.reduce((s: number, r: any) => s + Number(r.n), 0)

  const status = score === 0 ? 'dormant' : attended + hosted === 0 && score < LOW_SCORE ? 'low' : 'active'

  return {
    personId,
    name: nameRows[0]!.name,
    windowDays: days,
    isSelf,
    ...(boardView ? { status } : {}),
    score,
    weights: W,
    breakdown: { posts, replies, reactions, attended, hosted },
    points,
    firstSeen: summary.first_seen,
    lastSeen: summary.last_seen,
    messages,
    messagesPerActiveWeek,
    weekly,
    events: eventRows,
    reactionsReceived,
    topEmojis: emojiRows.slice(0, 6),
    topChannels: channelRows,
    coverageNote:
      'Slack er komplett fra 2026-06-30 (live webhook). Eldre Slack finnes til 2026-03-01, med et hull mar-jun. Oppmøte/hosting er komplett.',
  }
})
