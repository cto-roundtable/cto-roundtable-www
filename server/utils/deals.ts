import { createHash } from 'node:crypto'

/**
 * Cases ("caser"): a deal as the SPV members see it before and during a vote.
 * Tables: pipeline_deals (investor_visible, investor_blurb), deal_documents,
 * deal_rounds (ctoroundtable-hq migration 032). All case SQL lives here.
 *
 * Who sees a case is derived on every request, never stored
 * (decision 2026-10-22 on the vote model, project ctori-4):
 *   - the committee (`current-komite`) and the board (`styret`): every case that is
 *     in active work, investor-visible or has a round, drafts included;
 *   - a member of the ACTIVE invest group (the SPV deploying now,
 *     network_groups.invest_phase = 'deploying'): every case in active work
 *     (ACTIVE_STATUSES) or marked investor-visible that no SPV has invested in yet
 *     (the working pipeline, dc-33 H1 2026-10-23: all active work, no unreviewed leads);
 *   - a member of a round's group: that case, once the round is open;
 *   - a member of an invest group that invested in the company (investments):
 *     that case. A completed SPV sees its own companies and nothing else.
 * A deal without a slug is never a case.
 *
 * Seeing a case is not seeing its material: the blurb and the documents are shared
 * only once the committee marks it investor-visible or a round has opened
 * (materialSharedSql). Before that a member sees the name, stage, owner and date,
 * and can ask and give input.
 */

/** Active work (deal_statuses): what the active SPV sees. Leads ('incoming') are not. */
export const ACTIVE_STATUSES = ['reviewing', 'waiting', 'to_be_voted', 'pending_transfer']
/** Declined: shown on the feed only on request. 'passed' stays out until the founder is told ('rejected'). */
export const DECLINED_STATUSES = ['rejected']

export interface CaseViewer {
  personId: string
  /** committee or board: sees drafts and, in later steps, names */
  isStaff: boolean
  isCommittee: boolean
}

export async function caseViewer(personId: string): Promise<CaseViewer> {
  const [committee, board] = await Promise.all([isCommitteeMember(personId), isBoardMember(personId)])
  return { personId, isStaff: committee || board, isCommittee: committee }
}

/** Documents are listed raw inputs first and the memo last (plan §7a: the members
 *  who default to blank asked for the raw material, not a better narrative). */
const DOCUMENT_ORDER = ['deck', 'cto-call-notes', 'company-data', 'qa-log', 'numbers', 'memo']

function documentRank(key: string): number {
  const i = DOCUMENT_ORDER.indexOf(key)
  return i === -1 ? DOCUMENT_ORDER.length - 1 : i
}

export interface CaseSummary {
  slug: string
  name: string
  status: string
  blurb: string | null
  lastActivityAt: string | null
  round: {
    id: string
    group: { slug: string; name: string }
    status: string
    closesAt: string | null
    result: string | null
  } | null
}

/**
 * The cases this viewer may see, in review first (an open round, then
 * `to_be_voted`, then `reviewing`), then by last activity.
 */
export async function listCases(viewer: CaseViewer): Promise<CaseSummary[]> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT pd.id, pd.slug, o.name, pd.status, pd.last_activity_at,
           CASE WHEN ${materialSharedSql(sql, viewer)} THEN pd.investor_blurb END AS investor_blurb,
           r.id AS round_id, ng.slug AS round_group, ng.name AS round_group_name, r.status AS round_status, r.closes_at, r.result
    FROM pipeline_deals pd
    JOIN organizations o ON o.id = pd.organization_id
    LEFT JOIN LATERAL (
      SELECT r.* FROM deal_rounds r
      WHERE r.deal_id = pd.id AND (${viewer.isStaff} OR r.status IN ('open', 'closed'))
      ORDER BY (r.status = 'open') DESC, r.created_at DESC
      LIMIT 1
    ) r ON TRUE
    LEFT JOIN network_groups ng ON ng.id = r.group_id
    WHERE pd.slug IS NOT NULL
      AND ${caseVisibleSql(sql, viewer)}
    ORDER BY COALESCE(r.status = 'open', FALSE) DESC,
             CASE pd.status WHEN 'to_be_voted' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
             pd.last_activity_at DESC NULLS LAST, o.name
  `
  return (rows as any[]).map((r) => ({
    slug: r.slug,
    name: r.name,
    status: r.status,
    blurb: r.investor_blurb,
    lastActivityAt: r.last_activity_at,
    round: r.round_id
      ? {
          id: r.round_id,
          group: { slug: r.round_group, name: r.round_group_name },
          status: r.round_status,
          closesAt: r.closes_at,
          result: r.result,
        }
      : null,
  }))
}

/**
 * The access rule as one SQL condition over `pd` (pipeline_deals). Kept in one
 * place so the list, the case page and the document download cannot drift apart.
 */
function caseVisibleSql(sql: ReturnType<typeof useDatabase>, viewer: CaseViewer) {
  if (viewer.isStaff) {
    return sql`(pd.investor_visible OR pd.status = ANY(${ACTIVE_STATUSES})
                OR EXISTS (SELECT 1 FROM deal_rounds r0 WHERE r0.deal_id = pd.id))`
  }
  const p = viewer.personId
  return sql`(
    ((pd.investor_visible OR pd.status = ANY(${ACTIVE_STATUSES}))
      AND NOT EXISTS (SELECT 1 FROM investments i0 WHERE i0.deal_id = pd.id)
      AND EXISTS (
        SELECT 1 FROM memberships m JOIN network_groups g ON g.id = m.group_id
        WHERE m.person_id = ${p} AND g.invest_phase = 'deploying'))
    OR EXISTS (
      SELECT 1 FROM deal_rounds r0 JOIN memberships m ON m.group_id = r0.group_id
      WHERE r0.deal_id = pd.id AND r0.status IN ('open', 'closed') AND m.person_id = ${p})
    OR ((pd.investor_visible OR EXISTS (SELECT 1 FROM deal_rounds r1 WHERE r1.deal_id = pd.id AND r1.status <> 'draft'))
        AND EXISTS (
          SELECT 1 FROM investments i JOIN memberships m ON m.group_id = i.group_id
          WHERE i.deal_id = pd.id AND m.person_id = ${p}))
  )`
}

/** Whether the blurb and the documents of a visible case are shared with this viewer. */
function materialSharedSql(sql: ReturnType<typeof useDatabase>, viewer: CaseViewer) {
  return sql`(${viewer.isStaff} OR pd.investor_visible
              OR EXISTS (SELECT 1 FROM deal_rounds r2 WHERE r2.deal_id = pd.id AND r2.status <> 'draft'))`
}

/** Whether this viewer may see any case at all: decides the "Caser" nav item. */
export async function canSeeCases(personId: string): Promise<boolean> {
  const viewer = await caseViewer(personId)
  if (viewer.isStaff) return true
  const sql = useDatabase()
  // /api/auth/session asks this on every page: a failure here (say the 032 tables
  // are not in this database yet) must hide the nav item, never break sign-in.
  try {
    const rows = await sql`
      SELECT 1 FROM pipeline_deals pd
      WHERE pd.slug IS NOT NULL AND ${caseVisibleSql(sql, viewer)}
      LIMIT 1
    `
    return rows.length > 0
  } catch (err) {
    console.error('[deals] canSeeCases failed, hiding the Caser nav', err)
    return false
  }
}

export interface CaseDeal {
  id: string
  slug: string
  name: string
  status: string
  blurb: string | null
  owner: { id: string; name: string } | null
  lastActivityAt: string | null
  /** blurb and documents are shared with this viewer (materialSharedSql) */
  materialShared: boolean
}

/**
 * The deal behind a case, or a 404. A case the viewer may not see is the same
 * 404 as one that does not exist, so a slug cannot be probed.
 */
export async function requireCase(viewer: CaseViewer, slug: string): Promise<CaseDeal> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT pd.id, pd.slug, o.name, pd.status, pd.investor_blurb, pd.last_activity_at,
           owner.id AS owner_id, owner.name AS owner_name, ${materialSharedSql(sql, viewer)} AS material_shared
    FROM pipeline_deals pd
    JOIN organizations o ON o.id = pd.organization_id
    LEFT JOIN persons owner ON owner.id = pd.driver_person_id
    WHERE pd.slug = ${slug} AND ${caseVisibleSql(sql, viewer)}
    LIMIT 1
  `
  const r: any = rows[0]
  if (!r) throw createError({ statusCode: 404, message: 'Case not found' })
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    status: r.status,
    blurb: r.material_shared ? r.investor_blurb : null,
    owner: r.owner_id ? { id: r.owner_id, name: r.owner_name } : null,
    lastActivityAt: r.last_activity_at,
    materialShared: r.material_shared,
  }
}

export interface CaseDocument {
  id: string
  key: string
  title: string
  version: number
  sha256: string
  contentType: string
  bytes: number
  uploadedAt: string
}

/** The current version of each document key, raw inputs first, memo last. */
export async function listCaseDocuments(dealId: string): Promise<CaseDocument[]> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT DISTINCT ON (key) id, key, title, version, sha256, content_type, bytes, created_at
    FROM deal_documents
    WHERE deal_id = ${dealId}
    ORDER BY key, version DESC
  `
  return (rows as any[])
    .map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
      version: r.version,
      sha256: r.sha256,
      contentType: r.content_type,
      bytes: Number(r.bytes),
      uploadedAt: r.created_at,
    }))
    .sort((a, b) => documentRank(a.key) - documentRank(b.key) || a.key.localeCompare(b.key))
}

/** One document version of this deal (any version, so an old ballot's link still opens). */
export async function loadCaseDocument(
  dealId: string,
  documentId: string,
): Promise<{ objectKey: string; title: string; key: string; version: number; contentType: string } | null> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT object_key, title, key, version, content_type
    FROM deal_documents
    WHERE id = ${documentId} AND deal_id = ${dealId}
    LIMIT 1
  `
  const r: any = rows[0]
  return r
    ? { objectKey: r.object_key, title: r.title, key: r.key, version: r.version, contentType: r.content_type }
    : null
}

// --- Admin API (/api/admin/deals/**, memory votes/admin-api.md in ctori-4) -----------

export interface AdminDeal {
  slug: string
  name: string
  status: string
  investorVisible: boolean
  investorBlurb: string | null
  owner: { id: string; name: string } | null
  lastActivityAt: string | null
}

function adminDeal(r: any): AdminDeal {
  return {
    slug: r.slug,
    name: r.name,
    status: r.status,
    investorVisible: r.investor_visible,
    investorBlurb: r.investor_blurb,
    owner: r.owner_id ? { id: r.owner_id, name: r.owner_name } : null,
    lastActivityAt: r.last_activity_at,
  }
}

export async function adminListDeals(opts: { visibleOnly: boolean; status: string | null; limit: number }) {
  const sql = useDatabase()
  const rows = await sql`
    SELECT pd.id, pd.slug, o.name, pd.status, pd.investor_visible, pd.investor_blurb, pd.last_activity_at,
           owner.id AS owner_id, owner.name AS owner_name,
           COALESCE((
             SELECT json_agg(json_build_object('id', r.id, 'group', ng.slug, 'status', r.status, 'closesAt', r.closes_at)
                             ORDER BY r.created_at DESC)
             FROM deal_rounds r JOIN network_groups ng ON ng.id = r.group_id
             WHERE r.deal_id = pd.id
           ), '[]'::json) AS rounds
    FROM pipeline_deals pd
    JOIN organizations o ON o.id = pd.organization_id
    LEFT JOIN persons owner ON owner.id = pd.driver_person_id
    WHERE pd.slug IS NOT NULL
      AND (NOT ${opts.visibleOnly} OR pd.investor_visible)
      AND (${opts.status}::text IS NULL OR pd.status = ${opts.status})
    ORDER BY pd.last_activity_at DESC NULLS LAST, o.name
    LIMIT ${opts.limit}
  `
  // json_agg hands timestamps back as Postgres text; the API speaks ISO 8601 UTC.
  return (rows as any[]).map((r) => ({
    ...adminDeal(r),
    rounds: r.rounds.map((x: any) => ({ ...x, closesAt: x.closesAt ? new Date(x.closesAt).toISOString() : null })),
  }))
}

/** The deal by slug with its id, or null. Admin routes only: no access rule. */
async function adminFindDeal(slug: string): Promise<(AdminDeal & { id: string }) | null> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT pd.id, pd.slug, o.name, pd.status, pd.investor_visible, pd.investor_blurb, pd.last_activity_at,
           owner.id AS owner_id, owner.name AS owner_name
    FROM pipeline_deals pd
    JOIN organizations o ON o.id = pd.organization_id
    LEFT JOIN persons owner ON owner.id = pd.driver_person_id
    WHERE pd.slug = ${slug}
    LIMIT 1
  `
  return rows[0] ? { id: (rows[0] as any).id, ...adminDeal(rows[0]) } : null
}

export async function adminRequireDeal(slug: string): Promise<AdminDeal & { id: string }> {
  const deal = await adminFindDeal(slug)
  if (!deal) throw createError({ statusCode: 404, message: 'Deal not found' })
  return deal
}

export async function adminLoadDeal(slug: string) {
  const deal = await adminRequireDeal(slug)
  const sql = useDatabase()
  const [documents, rounds, investedBy] = await Promise.all([
    sql`
      SELECT key, title, version, sha256, content_type, bytes, created_at,
             version = MAX(version) OVER (PARTITION BY key) AS current
      FROM deal_documents WHERE deal_id = ${deal.id}
      ORDER BY key, version DESC
    `,
    sql`
      SELECT r.id, ng.slug AS group_slug, r.kind, r.status, r.opened_at, r.closes_at, r.closed_at, r.result
      FROM deal_rounds r JOIN network_groups ng ON ng.id = r.group_id
      WHERE r.deal_id = ${deal.id}
      ORDER BY r.created_at DESC
    `,
    sql`
      SELECT ng.slug FROM investments i JOIN network_groups ng ON ng.id = i.group_id
      WHERE i.deal_id = ${deal.id} ORDER BY ng.slug
    `,
  ])
  const { id: _id, ...publicDeal } = deal
  return {
    deal: publicDeal,
    documents: (documents as any[]).map((d) => ({
      key: d.key,
      title: d.title,
      version: d.version,
      sha256: d.sha256,
      contentType: d.content_type,
      bytes: Number(d.bytes),
      uploadedAt: d.created_at,
      current: d.current,
    })),
    rounds: (rounds as any[]).map((r) => ({
      id: r.id,
      group: r.group_slug,
      kind: r.kind,
      status: r.status,
      openedAt: r.opened_at,
      closesAt: r.closes_at,
      closedAt: r.closed_at,
      result: r.result,
    })),
    investedBy: (investedBy as any[]).map((r) => r.slug),
  }
}

export const MAX_BLURB = 400

/**
 * Set what the SPV sees of a deal before any round: the flag and the one or two
 * investor-safe lines. Writes a deal_events note (created_by names the token
 * owner) so the feed's "last change" moves.
 */
export async function setDealInvestorFields(
  dealId: string,
  changes: { investorVisible?: boolean; investorBlurb?: string | null },
  byPersonId: string,
): Promise<void> {
  const sql = useDatabase()
  const visible = changes.investorVisible ?? null
  const setBlurb = changes.investorBlurb !== undefined
  const blurb = changes.investorBlurb ?? null
  await sql`
    UPDATE pipeline_deals
    SET investor_visible = COALESCE(${visible}::boolean, investor_visible),
        investor_blurb = CASE WHEN ${setBlurb} THEN ${blurb}::text ELSE investor_blurb END
    WHERE id = ${dealId}
  `
  const what = [
    changes.investorVisible === undefined
      ? null
      : changes.investorVisible
        ? 'visible to investors'
        : 'hidden from investors',
    setBlurb ? 'investor blurb updated' : null,
  ]
    .filter(Boolean)
    .join(', ')
  await sql`
    INSERT INTO deal_events (deal_id, occurred_at, kind, body, source_kind, created_by)
    VALUES (${dealId}, NOW(), 'note', ${`Portal: ${what}`}, 'manual', ${`portal-admin-api:${byPersonId}`})
  `
}

const DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'text/markdown': 'md',
}
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
const DOCUMENT_KEY_RE = /^[a-z0-9-]{1,40}$/

/**
 * Upload one document for a deal. A new upload of a key is a new version; the
 * same bytes as the current version change nothing. Earlier versions stay,
 * because a ballot attests to their hash.
 */
export async function uploadDealDocument(
  deal: { id: string; slug: string },
  input: { key: string; title: string | null; contentType: string; data: Buffer; byPersonId: string },
) {
  if (!DOCUMENT_KEY_RE.test(input.key)) {
    throw createError({ statusCode: 400, message: 'key must be 1 to 40 of a-z, 0-9 and -' })
  }
  const contentType = input.contentType.split(';')[0]!.trim().toLowerCase()
  const ext = DOCUMENT_TYPES[contentType]
  if (!ext) {
    throw createError({
      statusCode: 415,
      message: `Content-Type must be one of ${Object.keys(DOCUMENT_TYPES).join(', ')}`,
    })
  }
  if (input.data.length === 0) throw createError({ statusCode: 400, message: 'Empty file' })
  if (input.data.length > MAX_DOCUMENT_BYTES) throw createError({ statusCode: 413, message: 'At most 25 MB' })
  const title = (input.title ?? '').trim()
  if (!title || title.length > 200) {
    throw createError({ statusCode: 400, message: 'title is required (?title=, at most 200 characters)' })
  }

  const sha256 = createHash('sha256').update(input.data).digest('hex')
  const sql = useDatabase()
  const current = (
    await sql`
    SELECT key, title, version, sha256, bytes FROM deal_documents
    WHERE deal_id = ${deal.id} AND key = ${input.key}
    ORDER BY version DESC LIMIT 1
  `
  )[0] as any
  if (current && current.sha256 === sha256) {
    return {
      document: {
        key: current.key,
        title: current.title,
        version: current.version,
        sha256,
        bytes: Number(current.bytes),
        current: true,
      },
      unchanged: true,
    }
  }

  const version = (current?.version ?? 0) + 1
  const objectKey = `deals/${deal.slug}/${input.key}/v${version}-${sha256.slice(0, 8)}.${ext}`
  await writeDealDocumentObject(objectKey, input.data, contentType)
  try {
    await sql`
      INSERT INTO deal_documents (deal_id, key, title, version, sha256, content_type, bytes, object_key, uploaded_by)
      VALUES (${deal.id}, ${input.key}, ${title}, ${version}, ${sha256}, ${contentType}, ${input.data.length},
              ${objectKey}, ${input.byPersonId})
    `
  } catch (err: any) {
    // Two uploads of the same key at once: the second loses on the unique version.
    if (err?.code === '23505') throw createError({ statusCode: 409, message: 'Another upload of this key won; retry' })
    throw err
  }
  return {
    document: { key: input.key, title, version, sha256, bytes: input.data.length, current: true },
    unchanged: false,
  }
}

// --- The pipeline feed (/member/pipeline) ---------------------------------------------

/** Stages that count as "in review now", in the order the feed shows them. */
const IN_REVIEW = ['to_be_voted', 'reviewing']

export interface PipelineRow {
  slug: string
  name: string
  status: string
  /** only when the material is shared (materialSharedSql) */
  blurb: string | null
  owner: string | null
  lastActivityAt: string | null
  /** an SPV this viewer is in invested in it */
  ours: boolean
  openRound: { closesAt: string; group: string } | null
  /** the case page opens for this viewer (always, except some declined rows) */
  canOpen: boolean
}

/**
 * The feed (decision 2026-10-22 §6, dc-33 2026-10-23): the ACTIVE SPV sees all active
 * work, open vote first, then up for a vote, in review, then by last activity; a
 * COMPLETED SPV sees only the companies it invested in. Which deals count is the case
 * rule (caseVisibleSql), so the feed, the case page and its actions never disagree.
 * With `declined`, also the companies the committee said no to (on request, dc-33 H1),
 * for the same people who see the working pipeline. `audience` names who sees the
 * working pipeline, so the page can say it plainly (dc-33 H2).
 */
export async function listPipeline(
  viewer: CaseViewer,
  opts: { declined: boolean } = { declined: false },
): Promise<{ audience: string[]; working: PipelineRow[]; invested: PipelineRow[]; declined: PipelineRow[] | null }> {
  const sql = useDatabase()
  const columns = sql`
    pd.slug, o.name, pd.status, pd.last_activity_at, owner.name AS owner_name,
    CASE WHEN ${materialSharedSql(sql, viewer)} THEN pd.investor_blurb END AS investor_blurb,
    EXISTS (
      SELECT 1 FROM investments i JOIN memberships m ON m.group_id = i.group_id
      WHERE i.deal_id = pd.id AND m.person_id = ${viewer.personId}
    ) AS ours,
    EXISTS (SELECT 1 FROM investments i WHERE i.deal_id = pd.id) AS invested,
    (SELECT json_build_object('closesAt', r.closes_at, 'group', ng.name)
     FROM deal_rounds r JOIN network_groups ng ON ng.id = r.group_id
     WHERE r.deal_id = pd.id AND r.status = 'open' LIMIT 1) AS open_round`
  const activeGroups = (await sql`
    SELECT g.name FROM network_groups g
    WHERE g.invest_phase = 'deploying'
      AND (${viewer.isStaff} OR EXISTS (SELECT 1 FROM memberships m WHERE m.group_id = g.id AND m.person_id = ${viewer.personId}))
    ORDER BY g.name
  `) as any[]
  const [rows, declinedRows] = await Promise.all([
    sql`
      SELECT ${columns}, TRUE AS can_open
      FROM pipeline_deals pd
      JOIN organizations o ON o.id = pd.organization_id
      LEFT JOIN persons owner ON owner.id = pd.driver_person_id
      WHERE pd.slug IS NOT NULL AND ${caseVisibleSql(sql, viewer)}
    ` as Promise<any[]>,
    opts.declined && activeGroups.length
      ? (sql`
          SELECT ${columns}, ${caseVisibleSql(sql, viewer)} AS can_open
          FROM pipeline_deals pd
          JOIN organizations o ON o.id = pd.organization_id
          LEFT JOIN persons owner ON owner.id = pd.driver_person_id
          WHERE pd.slug IS NOT NULL AND pd.status = ANY(${DECLINED_STATUSES})
            AND NOT EXISTS (SELECT 1 FROM investments i0 WHERE i0.deal_id = pd.id)
          ORDER BY pd.last_activity_at DESC NULLS LAST, o.name
          LIMIT 100
        ` as Promise<any[]>)
      : Promise.resolve(null),
  ])
  const out = (r: any): PipelineRow => ({
    slug: r.slug,
    name: r.name,
    status: r.status,
    blurb: r.investor_blurb,
    owner: r.owner_name,
    lastActivityAt: r.last_activity_at,
    ours: r.ours,
    openRound: r.open_round,
    canOpen: r.can_open,
  })
  const rank = (r: any) =>
    r.open_round ? -1 : IN_REVIEW.includes(r.status) ? IN_REVIEW.indexOf(r.status) : IN_REVIEW.length
  const byActivity = (a: any, b: any) =>
    rank(a) - rank(b) ||
    new Date(b.last_activity_at ?? 0).getTime() - new Date(a.last_activity_at ?? 0).getTime() ||
    a.name.localeCompare(b.name)
  return {
    audience: activeGroups.map((g) => g.name),
    // A declined deal with a closed round stays visible to that round's group, but it is not work.
    working: rows
      .filter((r) => !r.invested && !DECLINED_STATUSES.includes(r.status))
      .sort(byActivity)
      .map(out),
    invested: rows
      .filter((r) => r.invested && (r.ours || viewer.isStaff))
      .sort(byActivity)
      .map(out),
    declined: declinedRows ? declinedRows.map(out) : null,
  }
}
