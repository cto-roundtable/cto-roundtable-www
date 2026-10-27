import { renderMarkdown } from '../../app/utils/markdown'

/**
 * The pipeline digest: every second Monday, what moved in the pipeline, mailed to
 * the members of the SPV that is investing now (dc-33 H4 + ask-789, 2026-10-23;
 * memory decisions/2026-10-23-pipeline-feed.md in ctori-4). Table pipeline_digests
 * (ctoroundtable-hq migration 033).
 *
 * The box job (votes-data) reads the source (pipelineSource), has an agent draft
 * the text, and posts it (createPipelineDigest). For the first four weeks a
 * committee member approves each draft on /member/komite; once the group's first
 * approved digest is 28 days old, new drafts are approved on their own. The job then
 * calls send (the portal mails the group, sendPipelineDigest) and posts to Slack
 * itself (setPipelineDigestSlackRef).
 *
 * The source never carries deal_events bodies: they are the committee's own notes.
 * It gives stages, dates, the kinds of what happened, blurbs the committee already
 * shared, and the summaries already written for the SPV.
 */

export const MAX_PIPELINE_DIGEST = 8000
/** "Godkjenning de første fire ukene, så går den av seg selv." */
export const MANUAL_APPROVAL_DAYS = 28
const SOURCE_EVENT_KINDS = ['status_change', 'decision', 'meeting', 'round_opened', 'round_closed', 'question_answered']

export interface PipelineDigest {
  id: string
  group: { slug: string; name: string }
  periodStart: string
  bodyMd: string
  items: { slug: string; change: string }[]
  madeBy: string
  status: 'draft' | 'approved' | 'rejected' | 'sent'
  autoApproved: boolean
  approvedBy: { id: string; name: string } | null
  approvedAt: string | null
  rejectedReason: string | null
  sentAt: string | null
  mailCount: number | null
  slackRef: string | null
  createdAt: string
}

function digestOut(r: any): PipelineDigest {
  return {
    id: r.id,
    group: { slug: r.group_slug, name: r.group_name },
    periodStart: r.period_start instanceof Date ? r.period_start.toISOString().slice(0, 10) : String(r.period_start),
    bodyMd: r.body_md,
    items: r.items ?? [],
    madeBy: r.made_by,
    status: r.status,
    autoApproved: r.auto_approved,
    approvedBy: r.approved_by ? { id: r.approved_by, name: r.approver_name } : null,
    approvedAt: r.approved_at,
    rejectedReason: r.rejected_reason,
    sentAt: r.sent_at,
    mailCount: r.mail_count,
    slackRef: r.slack_ref,
    createdAt: r.created_at,
  }
}

const SELECT_DIGEST = (sql: ReturnType<typeof useDatabase>) => sql`
  SELECT d.*, g.slug AS group_slug, g.name AS group_name, ap.name AS approver_name
  FROM pipeline_digests d
  JOIN network_groups g ON g.id = d.group_id
  LEFT JOIN persons ap ON ap.id = d.approved_by`

/** The investing (deploying) group by slug, or a 400. */
async function deployingGroup(slug: unknown) {
  if (typeof slug !== 'string' || !slug) throw createError({ statusCode: 400, message: 'group is required' })
  const sql = useDatabase()
  const rows = (await sql`SELECT id, slug, name, invest_phase FROM network_groups WHERE slug = ${slug}`) as any[]
  if (!rows[0]) throw createError({ statusCode: 404, message: 'Group not found' })
  if (rows[0].invest_phase !== 'deploying') {
    throw createError({ statusCode: 400, message: `${slug} is not the SPV investing now (invest_phase = deploying)` })
  }
  return rows[0] as { id: string; slug: string; name: string }
}

/**
 * GET /api/admin/pipeline-digests/source: what the group's members see on the feed
 * (the case rule for an active-SPV member), with what happened since `since`.
 */
export async function pipelineSource(groupSlug: unknown, since: unknown) {
  const group = await deployingGroup(groupSlug)
  if (typeof since !== 'string' || Number.isNaN(Date.parse(since))) {
    throw createError({ statusCode: 400, message: 'since must be an ISO timestamp' })
  }
  const sql = useDatabase()
  const deals = (await sql`
    SELECT pd.id, pd.slug, o.name, pd.status, pd.last_activity_at, pd.investor_blurb,
           (pd.investor_visible
            OR EXISTS (SELECT 1 FROM deal_rounds r2 WHERE r2.deal_id = pd.id AND r2.status <> 'draft')) AS material_shared,
           (SELECT json_build_object('status', r.status, 'closesAt', r.closes_at, 'result', r.result)
            FROM deal_rounds r WHERE r.deal_id = pd.id AND r.group_id = ${group.id} AND r.status IN ('open', 'closed')
            ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 1) AS round,
           COALESCE((
             SELECT json_agg(json_build_object('kind', e.kind, 'occurredAt', e.occurred_at) ORDER BY e.occurred_at)
             FROM deal_events e
             WHERE e.deal_id = pd.id AND e.occurred_at > ${since}::timestamptz AND e.kind = ANY(${SOURCE_EVENT_KINDS})
           ), '[]'::json) AS events
    FROM pipeline_deals pd
    JOIN organizations o ON o.id = pd.organization_id
    WHERE pd.slug IS NOT NULL
      AND (pd.investor_visible OR pd.status = ANY(${ACTIVE_STATUSES}) OR pd.status = ANY(${DECLINED_STATUSES}))
      AND NOT EXISTS (SELECT 1 FROM investments i0 WHERE i0.deal_id = pd.id)
    ORDER BY pd.last_activity_at DESC NULLS LAST, o.name
  `) as any[]
  const ids = deals.map((d) => d.id)
  const spvDigests = ids.length
    ? ((await sql`
        SELECT pd.slug, d.body_md, d.created_at
        FROM deal_digests d JOIN pipeline_deals pd ON pd.id = d.deal_id
        WHERE d.deal_id = ANY(${ids}::uuid[]) AND d.audience = 'spv' AND d.created_at > ${since}::timestamptz
        ORDER BY d.created_at
      `) as any[])
    : []
  const isDeclined = (d: any) => DECLINED_STATUSES.includes(d.status)
  return {
    group: { slug: group.slug, name: group.name },
    since,
    deals: deals
      // A declined company is news only if it was declined in the period (its status change).
      .filter((d) => !isDeclined(d) || (d.events as any[]).some((e) => e.kind === 'status_change'))
      .map((d) => ({
        slug: d.slug,
        name: d.name,
        status: d.status,
        declined: isDeclined(d),
        materialShared: d.material_shared,
        blurb: d.material_shared ? d.investor_blurb : null,
        lastActivityAt: d.last_activity_at,
        round: d.round,
        events: d.events,
      })),
    spvDigests: spvDigests.map((x) => ({ slug: x.slug, bodyMd: x.body_md, createdAt: x.created_at })),
  }
}

const KEYS = ['group', 'periodStart', 'bodyMd', 'items', 'madeBy']

/** POST /api/admin/pipeline-digests: a draft, or approved at once after the first four weeks. */
export async function createPipelineDigest(body: Record<string, unknown>) {
  const extra = Object.keys(body).filter((k) => !KEYS.includes(k))
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
  const group = await deployingGroup(body.group)
  const ps = body.periodStart
  if (typeof ps !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ps) || new Date(`${ps}T12:00:00Z`).getUTCDay() !== 1) {
    throw createError({ statusCode: 400, message: 'periodStart must be a Monday, YYYY-MM-DD' })
  }
  if (typeof body.bodyMd !== 'string' || !body.bodyMd.trim() || body.bodyMd.length > MAX_PIPELINE_DIGEST) {
    throw createError({ statusCode: 400, message: `bodyMd is required (at most ${MAX_PIPELINE_DIGEST})` })
  }
  if (typeof body.madeBy !== 'string' || !body.madeBy.trim() || body.madeBy.length > 300) {
    throw createError({ statusCode: 400, message: 'madeBy is required ("agent:<acp link>")' })
  }
  const items = body.items === undefined ? [] : body.items
  if (
    !Array.isArray(items) ||
    items.length > 100 ||
    items.some((x: any) => typeof x?.slug !== 'string' || typeof x?.change !== 'string' || x.change.length > 300)
  ) {
    throw createError({ statusCode: 400, message: 'items must be [{slug, change}] (at most 100, change at most 300)' })
  }
  const sql = useDatabase()
  const first = (await sql`
    SELECT MIN(approved_at) AS first FROM pipeline_digests
    WHERE group_id = ${group.id} AND approved_by IS NOT NULL
  `) as any[]
  const auto = !!first[0]?.first && Date.now() - new Date(first[0].first).getTime() >= MANUAL_APPROVAL_DAYS * 86400000
  try {
    const rows = (await sql`
      INSERT INTO pipeline_digests (group_id, period_start, body_md, items, made_by, status, auto_approved, approved_at)
      VALUES (${group.id}, ${ps}, ${body.bodyMd.trim()},
              ${JSON.stringify(items.map((x: any) => ({ slug: x.slug, change: x.change.trim() })))}::jsonb,
              ${body.madeBy.trim()}, ${auto ? 'approved' : 'draft'}, ${auto}, ${auto ? new Date().toISOString() : null})
      RETURNING id
    `) as any[]
    return { digest: await getPipelineDigest(rows[0].id) }
  } catch (err: any) {
    if (err?.code === '23505') {
      throw createError({ statusCode: 409, message: `${group.slug} already has a digest for ${ps}` })
    }
    throw err
  }
}

export async function getPipelineDigest(id: string): Promise<PipelineDigest> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw createError({ statusCode: 404, message: 'Digest not found' })
  const sql = useDatabase()
  const rows = (await sql`${SELECT_DIGEST(sql)} WHERE d.id = ${id}`) as any[]
  if (!rows[0]) throw createError({ statusCode: 404, message: 'Digest not found' })
  return digestOut(rows[0])
}

const STATUSES = ['draft', 'approved', 'rejected', 'sent']

export async function listPipelineDigests(opts: { status: unknown; group: unknown; limit: number }) {
  if (opts.status !== undefined && !STATUSES.includes(opts.status as string)) {
    throw createError({ statusCode: 400, message: `status must be one of ${STATUSES.join(', ')}` })
  }
  const status = (opts.status as string) ?? null
  const group = typeof opts.group === 'string' ? opts.group : null
  const sql = useDatabase()
  const rows = (await sql`
    ${SELECT_DIGEST(sql)}
    WHERE (${status}::text IS NULL OR d.status = ${status})
      AND (${group}::text IS NULL OR g.slug = ${group})
    ORDER BY d.period_start DESC, d.created_at DESC
    LIMIT ${opts.limit}
  `) as any[]
  return rows.map(digestOut)
}

/** A committee member approves a draft, optionally with an edited text. */
export async function approvePipelineDigest(personId: string, id: string, body: Record<string, unknown>) {
  const extra = Object.keys(body).filter((k) => k !== 'bodyMd')
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
  let edited: string | null = null
  if (body.bodyMd !== undefined) {
    if (typeof body.bodyMd !== 'string' || !body.bodyMd.trim() || body.bodyMd.length > MAX_PIPELINE_DIGEST) {
      throw createError({ statusCode: 400, message: `bodyMd must be text of at most ${MAX_PIPELINE_DIGEST}` })
    }
    edited = body.bodyMd.trim()
  }
  await getPipelineDigest(id)
  const sql = useDatabase()
  const rows = await sql`
    UPDATE pipeline_digests
    SET status = 'approved', approved_by = ${personId}, approved_at = NOW(), body_md = COALESCE(${edited}, body_md)
    WHERE id = ${id} AND status = 'draft'
    RETURNING id
  `
  if (!rows.length) throw createError({ statusCode: 409, message: 'Only a draft can be approved' })
  return { digest: await getPipelineDigest(id) }
}

export async function rejectPipelineDigest(personId: string, id: string, body: Record<string, unknown>) {
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (!reason) throw createError({ statusCode: 400, message: 'reason is required' })
  await getPipelineDigest(id)
  const sql = useDatabase()
  const rows = await sql`
    UPDATE pipeline_digests SET status = 'rejected', rejected_by = ${personId}, rejected_reason = ${reason}
    WHERE id = ${id} AND status = 'draft'
    RETURNING id
  `
  if (!rows.length) throw createError({ statusCode: 409, message: 'Only a draft can be rejected' })
  return { digest: await getPipelineDigest(id) }
}

/** The members a digest goes to: active people in the group. */
async function recipients(groupId: string) {
  const sql = useDatabase()
  return (await sql`
    SELECT p.id FROM memberships m JOIN persons p ON p.id = m.person_id
    WHERE m.group_id = ${groupId} AND p.status = 'active'
    ORDER BY p.name
  `) as { id: string }[]
}

function digestMail(lang: 'nb' | 'en', d: PipelineDigest, target: { name: string }, link: string) {
  const date = new Date(`${d.periodStart}T12:00:00Z`).toLocaleDateString(lang === 'nb' ? 'nb-NO' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Oslo',
  })
  const nb = lang === 'nb'
  return {
    subject: nb ? `Pipelinen ${date}: dette har skjedd` : `The pipeline ${date}: what moved`,
    html: mailLayout([
      mailParagraph(`${nb ? 'Hei' : 'Hi'} ${firstNameHtml(target.name)},`),
      mailParagraph(
        escapeHtml(
          nb
            ? `Dette har skjedd i pipelinen til ${d.group.name} de siste to ukene.`
            : `This is what moved in the ${d.group.name} pipeline over the last two weeks.`,
        ),
      ),
      `<div style="color: #333; font-size: 15px; line-height: 1.5;">${renderMarkdown(d.bodyMd)}</div>`,
      mailButton(link, nb ? 'Se pipelinen' : 'See the pipeline'),
      mailParagraph(
        escapeHtml(
          nb
            ? 'Har du innvendinger, eller kjenner du noen av dem? Si fra på selskapet i portalen. Komiteen ser det, de andre medlemmene gjør ikke det.'
            : 'Any objections, or do you know one of them? Say so on the company in the portal. The committee sees it; the other members do not.',
        ),
        'color: #888; font-size: 13px;',
      ),
    ]),
  }
}

/**
 * POST /api/admin/pipeline-digests/:id/send: mail the group. The status moves to
 * 'sent' BEFORE the first mail (compare-and-set), so a retry can never mail anyone
 * twice; a failure is returned, and resending to those is a person's decision.
 */
export async function sendPipelineDigest(id: string, opts: { dryRun: boolean; siteUrl: string }) {
  const d = await getPipelineDigest(id)
  if (d.status !== 'approved') {
    throw createError({ statusCode: 409, message: `Digest is ${d.status}; only an approved digest is sent` })
  }
  const sql = useDatabase()
  const group = (await sql`SELECT id FROM network_groups WHERE slug = ${d.group.slug}`) as any[]
  const people = await recipients(group[0].id)
  const link = `${opts.siteUrl}/member/pipeline`
  const sent: string[] = []
  const skipped: { personId: string; reason: string }[] = []
  const failed: { personId: string; error: string }[] = []
  if (!opts.dryRun) {
    const claimed = await sql`
      UPDATE pipeline_digests SET status = 'sent', sent_at = NOW() WHERE id = ${id} AND status = 'approved' RETURNING id
    `
    if (!claimed.length) throw createError({ statusCode: 409, message: 'Digest was sent by another call' })
  }
  for (const p of people) {
    const target = await personMailTarget(p.id)
    if (!target) {
      skipped.push({ personId: p.id, reason: 'no_email' })
      continue
    }
    if (opts.dryRun) {
      sent.push(p.id)
      continue
    }
    try {
      const lang = (await getChapters(p.id)).includes('no') ? 'nb' : 'en'
      const mail = digestMail(lang, d, target, link)
      await sendMail({ to: target.email, subject: mail.subject, html: mail.html })
      sent.push(p.id)
    } catch (err: any) {
      failed.push({ personId: p.id, error: String(err?.message ?? err).slice(0, 200) })
    }
  }
  if (!opts.dryRun) await sql`UPDATE pipeline_digests SET mail_count = ${sent.length} WHERE id = ${id}`
  return { sent: sent.length, skipped, failed, dryRun: opts.dryRun }
}

/** PATCH /api/admin/pipeline-digests/:id {slackRef}: the job posted it to Slack. */
export async function setPipelineDigestSlackRef(id: string, body: Record<string, unknown>) {
  const extra = Object.keys(body).filter((k) => k !== 'slackRef')
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
  if (typeof body.slackRef !== 'string' || !body.slackRef.trim() || body.slackRef.length > 300) {
    throw createError({ statusCode: 400, message: 'slackRef is required' })
  }
  const sql = useDatabase()
  const rows = await sql`
    UPDATE pipeline_digests SET slack_ref = ${body.slackRef.trim()}
    WHERE id = ${id} AND status IN ('approved', 'sent') RETURNING id
  `
  if (!rows.length) throw createError({ statusCode: 409, message: 'Only an approved or sent digest goes to Slack' })
  return { digest: await getPipelineDigest(id) }
}

/** The newest sent digest for the viewer's investing SPV(s), shown on top of the feed. */
export async function latestSentDigest(viewer: CaseViewer): Promise<PipelineDigest | null> {
  const sql = useDatabase()
  const rows = (await sql`
    ${SELECT_DIGEST(sql)}
    WHERE d.status = 'sent' AND g.invest_phase = 'deploying'
      AND (${viewer.isStaff} OR EXISTS (SELECT 1 FROM memberships m WHERE m.group_id = g.id AND m.person_id = ${viewer.personId}))
    ORDER BY d.sent_at DESC LIMIT 1
  `) as any[]
  return rows[0] ? digestOut(rows[0]) : null
}
