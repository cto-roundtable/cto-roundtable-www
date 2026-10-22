/**
 * What an agent made of the comments on a deal. Table deal_digests
 * (ctoroundtable-hq migration 032). All digest SQL lives here.
 *
 * The deal-digest job on the box reads new comments WITH names
 * (GET /api/admin/comments, decision 2026-10-22 §5: agents may read names) and
 * posts a digest: a short summary, themes with counts, questions for the
 * founder, and anything that is new information. The committee reads it on the
 * case page and on /member/komite. A digest with audience 'spv' is the short
 * "this is what we heard" for everyone who can see the case.
 */

export const MAX_DIGEST = 8000

export interface Digest {
  id: string
  kind: string
  audience: 'committee' | 'spv'
  roundId: string | null
  bodyMd: string
  themes: { theme: string; count: number; of?: number }[]
  founderQuestions: { text: string; commentIds?: string[] }[]
  newInformation: { text: string; commentIds?: string[] }[]
  commentIds: string[]
  madeBy: string
  createdAt: string
}

function digestOut(r: any): Digest {
  return {
    id: r.id,
    kind: r.kind,
    audience: r.audience,
    roundId: r.round_id,
    bodyMd: r.body_md,
    themes: r.themes ?? [],
    founderQuestions: r.founder_questions ?? [],
    newInformation: r.new_information ?? [],
    commentIds: r.comment_ids ?? [],
    madeBy: r.made_by,
    createdAt: r.created_at,
  }
}

export async function listDigests(dealId: string, opts: { audience: 'committee' | 'spv' | null; limit: number }) {
  const sql = useDatabase()
  const rows = await sql`
    SELECT * FROM deal_digests
    WHERE deal_id = ${dealId} AND kind = 'comments'
      AND (${opts.audience}::text IS NULL OR audience = ${opts.audience})
    ORDER BY created_at DESC
    LIMIT ${opts.limit}
  `
  return (rows as any[]).map(digestOut)
}

/** The digests a case page shows: the newest committee one for staff, the newest SPV one for everyone. */
export async function caseDigests(viewer: CaseViewer, dealId: string) {
  const [committee, spv] = await Promise.all([
    viewer.isStaff ? listDigests(dealId, { audience: 'committee', limit: 1 }) : Promise.resolve([]),
    listDigests(dealId, { audience: 'spv', limit: 1 }),
  ])
  return { committee: committee[0] ?? null, spv: spv[0] ?? null }
}

function cleanItems(value: unknown, what: string, withCount: boolean) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 50)
    throw createError({ statusCode: 400, message: `${what} must be a list of at most 50` })
  return value.map((x: any) => {
    const text = withCount ? x?.theme : x?.text
    if (typeof text !== 'string' || !text.trim() || text.length > 500) {
      throw createError({
        statusCode: 400,
        message: `every ${what} entry needs ${withCount ? 'theme' : 'text'} (at most 500)`,
      })
    }
    if (withCount) {
      if (!Number.isInteger(x.count) || x.count < 0)
        throw createError({ statusCode: 400, message: 'themes[].count must be a whole number' })
      return { theme: text.trim(), count: x.count, ...(Number.isInteger(x.of) ? { of: x.of } : {}) }
    }
    const ids = Array.isArray(x.commentIds) ? x.commentIds.filter((i: unknown) => typeof i === 'string') : []
    return { text: text.trim(), commentIds: ids }
  })
}

const KEYS = [
  'kind',
  'audience',
  'roundId',
  'bodyMd',
  'themes',
  'founderQuestions',
  'newInformation',
  'commentIds',
  'madeBy',
]

/** POST /api/admin/deals/:slug/digests. Every comment id must belong to the deal. */
export async function addDigest(dealId: string, body: Record<string, unknown>) {
  const extra = Object.keys(body).filter((k) => !KEYS.includes(k))
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
  if (body.kind !== 'comments') throw createError({ statusCode: 400, message: 'kind must be comments' })
  if (body.audience !== 'committee' && body.audience !== 'spv') {
    throw createError({ statusCode: 400, message: 'audience must be committee or spv' })
  }
  if (typeof body.bodyMd !== 'string' || !body.bodyMd.trim() || body.bodyMd.length > MAX_DIGEST) {
    throw createError({ statusCode: 400, message: `bodyMd is required (at most ${MAX_DIGEST})` })
  }
  if (typeof body.madeBy !== 'string' || !body.madeBy.trim() || body.madeBy.length > 300) {
    throw createError({ statusCode: 400, message: 'madeBy is required ("agent:<acp link>" or a person)' })
  }
  const themes = cleanItems(body.themes, 'themes', true)
  const founderQuestions = cleanItems(body.founderQuestions, 'founderQuestions', false)
  const newInformation = cleanItems(body.newInformation, 'newInformation', false)
  const commentIds = Array.isArray(body.commentIds) ? body.commentIds : []
  if (commentIds.some((i) => typeof i !== 'string' || !/^[0-9a-f-]{36}$/i.test(i))) {
    throw createError({ statusCode: 400, message: 'commentIds must be comment uuids' })
  }

  const sql = useDatabase()
  if (commentIds.length) {
    const found = (await sql`
      SELECT COUNT(*)::int AS n FROM deal_comments WHERE deal_id = ${dealId} AND id = ANY(${commentIds}::uuid[])
    `) as any[]
    if (found[0].n !== new Set(commentIds).size) {
      throw createError({ statusCode: 400, message: 'commentIds must all be comments on this deal' })
    }
  }
  let roundId: string | null = null
  if (body.roundId !== undefined && body.roundId !== null) {
    const r = typeof body.roundId === 'string' ? await loadRound(body.roundId) : null
    if (!r || r.deal_id !== dealId)
      throw createError({ statusCode: 400, message: 'roundId is not a round on this deal' })
    roundId = r.id
  }

  const [inserted] = await sql.transaction([
    sql`
      INSERT INTO deal_digests (deal_id, round_id, kind, audience, body_md, themes, founder_questions, new_information, comment_ids, made_by)
      VALUES (${dealId}, ${roundId}, 'comments', ${body.audience}, ${body.bodyMd.trim()}, ${JSON.stringify(themes)}::jsonb,
              ${JSON.stringify(founderQuestions)}::jsonb, ${JSON.stringify(newInformation)}::jsonb,
              ${commentIds}::uuid[], ${body.madeBy.trim()})
      RETURNING id, created_at
    `,
    sql`
      INSERT INTO deal_events (deal_id, occurred_at, kind, body, source_kind, created_by)
      VALUES (${dealId}, NOW(), 'comment_digest', ${`Comment digest for the ${body.audience} (${commentIds.length} comments)`},
              'manual', 'portal')
    `,
  ])
  const row = (inserted as any[])[0]
  return { digest: { id: row.id, createdAt: row.created_at } }
}

/** GET /api/admin/comments: comments with author names, oldest first, withdrawn left out. */
export async function adminListComments(opts: { since: string | null; slug: string | null; limit: number }) {
  const sql = useDatabase()
  const rows = await sql`
    SELECT c.id, pd.slug, o.name AS deal_name, c.round_id, c.kind, c.body, c.author_person_id, p.name AS author_name, c.created_at
    FROM deal_comments c
    JOIN pipeline_deals pd ON pd.id = c.deal_id
    JOIN organizations o ON o.id = pd.organization_id
    JOIN persons p ON p.id = c.author_person_id
    WHERE c.withdrawn_at IS NULL
      AND (${opts.since}::timestamptz IS NULL OR c.created_at > ${opts.since}::timestamptz)
      AND (${opts.slug}::text IS NULL OR pd.slug = ${opts.slug})
    ORDER BY c.created_at
    LIMIT ${opts.limit}
  `
  return (rows as any[]).map((r) => ({
    id: r.id,
    deal: { slug: r.slug, name: r.deal_name },
    roundId: r.round_id,
    kind: r.kind,
    body: r.body,
    author: { id: r.author_person_id, name: r.author_name },
    createdAt: r.created_at,
  }))
}

/**
 * The committee's overview (/member/komite): every case that is visible or has
 * a round, with what waits for the committee: open and routed questions, new
 * comments since the newest committee digest, the vote, and that digest.
 */
export async function committeeOverview() {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT pd.id, pd.slug, o.name, pd.status, pd.last_activity_at,
      (SELECT COUNT(*)::int FROM deal_questions q WHERE q.deal_id = pd.id AND q.status IN ('new', 'agent_working')) AS q_open,
      (SELECT COUNT(*)::int FROM deal_questions q WHERE q.deal_id = pd.id AND q.status IN ('routed', 'founder_asked')) AS q_routed,
      (SELECT COUNT(*)::int FROM deal_answers a JOIN deal_questions q ON q.id = a.question_id
        WHERE q.deal_id = pd.id AND a.by_kind = 'agent' AND a.superseded_by IS NULL AND a.confirmed_at IS NULL) AS a_unconfirmed,
      (SELECT COUNT(*)::int FROM deal_comments c WHERE c.deal_id = pd.id AND c.withdrawn_at IS NULL) AS comments,
      (SELECT COUNT(*)::int FROM deal_comments c WHERE c.deal_id = pd.id AND c.withdrawn_at IS NULL
        AND c.created_at > COALESCE((SELECT MAX(d.created_at) FROM deal_digests d
                                     WHERE d.deal_id = pd.id AND d.audience = 'committee'), '-infinity'::timestamptz)) AS comments_new,
      (SELECT json_build_object('status', r.status, 'closesAt', r.closes_at, 'result', r.result, 'group', ng.name)
       FROM deal_rounds r JOIN network_groups ng ON ng.id = r.group_id
       WHERE r.deal_id = pd.id AND r.source = 'portal'
       ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 1) AS round
    FROM pipeline_deals pd
    JOIN organizations o ON o.id = pd.organization_id
    WHERE pd.slug IS NOT NULL
      AND (pd.investor_visible OR EXISTS (SELECT 1 FROM deal_rounds r0 WHERE r0.deal_id = pd.id AND r0.source = 'portal'))
    ORDER BY pd.last_activity_at DESC NULLS LAST, o.name
  `) as any[]
  const digests = rows.length
    ? ((await sql`
        SELECT DISTINCT ON (deal_id) * FROM deal_digests
        WHERE deal_id = ANY(${rows.map((r) => r.id)}::uuid[]) AND audience = 'committee' AND kind = 'comments'
        ORDER BY deal_id, created_at DESC
      `) as any[])
    : []
  const byDeal = new Map(digests.map((d) => [d.deal_id, digestOut(d)]))
  return rows
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      status: r.status,
      lastActivityAt: r.last_activity_at,
      questionsOpen: r.q_open,
      questionsRouted: r.q_routed,
      answersUnconfirmed: r.a_unconfirmed,
      comments: r.comments,
      commentsSinceDigest: r.comments_new,
      round: r.round,
      digest: byDeal.get(r.id) ?? null,
    }))
    .sort((a, b) => needsCommittee(b) - needsCommittee(a))
}

/** What waits for the committee on a case, for ordering the overview: most first. */
function needsCommittee(c: {
  questionsRouted: number
  answersUnconfirmed: number
  commentsSinceDigest: number
  round: any
}) {
  return (
    (c.round?.status === 'open' ? 100 : 0) + c.questionsRouted * 10 + c.answersUnconfirmed * 5 + c.commentsSinceDigest
  )
}
