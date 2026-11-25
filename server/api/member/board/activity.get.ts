// GET /api/member/board/activity?days=365&chapter=no|se
// Board-only (styret) member-activity picture over a rolling window.
// Feeds the styret's "flag inactive members" work. Reads the activity_events
// signal layer (Slack messages/reactions + Luma attendance/hosting).
// Portal page views (source 'portal', server/utils/portalVisits.ts) are their own
// column, `portalViews` and `lastPortal`; they add nothing to the score, the status or
// "sist sett", which mean what they meant before the visit log.
//
// Universe = everyone in one chapter group (LEFT JOIN activity), so members with
// zero signals in the window are included: those are the ones to flag. Active
// members are scored; everyone else (pensjonister first of all, with the date
// they retired) comes back in `former`, so the board sees every status in one
// place. Each row also carries who the person is to us: member since, and the
// board, committee and SPV groups they sit in.
// chapter=no (default) is cto-roundtable, chapter=se the Swedish chapter; the
// two are kept apart because they run separately (vedtak 6).
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
  const chapter: Chapter = isChapter(q.chapter) ? q.chapter : 'no'

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
      WHERE person_id IS NOT NULL AND source <> ${VISIT_SOURCE}
        AND occurred_at >= now() - make_interval(days => ${days})
      GROUP BY person_id
    ),
    ever AS (
      SELECT person_id, max(occurred_at) AS last_ever
      FROM activity_events WHERE person_id IS NOT NULL AND source <> ${VISIT_SOURCE} GROUP BY person_id
    ),
    portal AS (
      SELECT person_id,
        count(*) FILTER (WHERE occurred_at >= now() - make_interval(days => ${days})) AS views,
        max(occurred_at) AS last_portal
      FROM activity_events
      WHERE person_id IS NOT NULL AND source = ${VISIT_SOURCE} AND event_type = ${VISIT_EVENT}
      GROUP BY person_id
    ),
    groups AS (
      SELECT m.person_id, array_agg(g.slug ORDER BY g.slug) AS slugs
      FROM memberships m JOIN network_groups g ON g.id = m.group_id
      GROUP BY m.person_id
    ),
    rejoin AS (
      SELECT DISTINCT ON (person_id) person_id, created_at
      FROM join_requests WHERE status = 'pending'
      ORDER BY person_id, created_at DESC
    )
    SELECT
      p.id, p.name, p.status, p.retired_at, m.joined_at,
      COALESCE(gr.slugs, '{}')  AS slugs,
      rj.created_at             AS rejoin_requested_at,
      COALESCE(a.posts, 0)     AS posts,
      COALESCE(a.replies, 0)   AS replies,
      COALESCE(a.reactions, 0) AS reactions,
      COALESCE(a.attended, 0)  AS attended,
      COALESCE(a.hosted, 0)    AS hosted,
      a.last_seen,
      e.last_ever,
      COALESCE(pv.views, 0)    AS portal_views,
      pv.last_portal,
      (COALESCE(a.posts,0) * 3 + COALESCE(a.replies,0) * 2 + COALESCE(a.reactions,0)
        + COALESCE(a.attended,0) * 5 + COALESCE(a.hosted,0) * 8) AS score
    FROM persons p
    JOIN memberships m    ON m.person_id = p.id
    JOIN network_groups g ON g.id = m.group_id AND g.slug = ${CHAPTER_GROUPS[chapter]}
    LEFT JOIN act a     ON a.person_id = p.id
    LEFT JOIN ever e    ON e.person_id = p.id
    LEFT JOIN portal pv ON pv.person_id = p.id
    LEFT JOIN groups gr ON gr.person_id = p.id
    LEFT JOIN rejoin rj ON rj.person_id = p.id
    ORDER BY score ASC, e.last_ever ASC NULLS FIRST, p.name
  `

  const members = rows
    .filter((r: any) => r.status === 'active')
    .map((r: any) => {
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
        roles: rolesOf(r.slugs),
        joinedAt: r.joined_at,
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
        portalViews: Number(r.portal_views),
        lastPortal: r.last_portal,
      }
    })

  // Not active: pensjonister (newest retirement first), then any other status
  // (prospect, inactive) so nothing in the chapter group is invisible.
  const former = rows
    .filter((r: any) => r.status !== 'active')
    .map((r: any) => ({
      personId: r.id,
      name: r.name,
      personStatus: r.status as string,
      roles: rolesOf(r.slugs),
      joinedAt: r.joined_at,
      retiredAt: r.retired_at,
      lastEver: r.last_ever,
      portalViews: Number(r.portal_views),
      lastPortal: r.last_portal,
      rejoinRequestedAt: r.rejoin_requested_at,
    }))
    .sort((a: any, b: any) => {
      if ((a.personStatus === 'retired') !== (b.personStatus === 'retired'))
        return a.personStatus === 'retired' ? -1 : 1
      return time(b.retiredAt) - time(a.retiredAt) || a.name.localeCompare(b.name, 'nb')
    })

  const summary = {
    total: members.length,
    dormant: members.filter((m) => m.status === 'dormant').length,
    low: members.filter((m) => m.status === 'low').length,
    active: members.filter((m) => m.status === 'active').length,
    retired: former.filter((f) => f.personStatus === 'retired').length,
    otherStatus: former.filter((f) => f.personStatus !== 'retired').length,
  }

  return {
    windowDays: days,
    chapter,
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
    former,
  }
})

// A timestamp column as epoch ms (the driver hands back Date objects); 0 for none.
function time(d: Date | string | null): number {
  return d ? new Date(d).getTime() : 0
}

// Who the person is to us, from their groups: the board, the investment
// committee (current or former) and each CTORI SPV they are in. The chapter
// groups and mailing groups say nothing here and are left out.
function rolesOf(slugs: string[]): string[] {
  const roles: string[] = []
  if (slugs.includes('styret')) roles.push('Styret')
  if (slugs.includes('current-komite')) roles.push('Komité')
  else if (slugs.includes('ex-komite')) roles.push('Tidl. komité')
  for (const slug of slugs) {
    const spv = /^invest-(\d+)$/.exec(slug)
    if (spv) roles.push(`CTORI ${spv[1]}`)
  }
  return roles
}
