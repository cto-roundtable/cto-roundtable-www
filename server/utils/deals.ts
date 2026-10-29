import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'

/**
 * Cases ("caser"): a deal as the SPV members see it before and during a vote.
 * Tables: pipeline_deals (investor_visible, investor_blurb), deal_documents,
 * deal_rounds (ctoroundtable-hq migration 032). All case SQL lives here.
 *
 * Who sees a case is derived on every request, never stored
 * (decision 2026-10-22 on the vote model, project ctori-4):
 *   - the committee (`current-komite`): every case that is in active work,
 *     investor-visible or has a round, drafts included. The board (`styret`) is NOT
 *     staff here: for cases a board member is a member like any other (Snorre,
 *     2026-10-29: "They are separate entities");
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
  /** the network groups this viewer is in (ids): every membership rule below reads these */
  groupIds: string[]
  /** current-komite: sees drafts, names, and every case in active work */
  isCommittee: boolean
  /** a committee member looking at the page as a role sees it (?som=); read-only */
  preview: PreviewRole | null
}

export async function caseViewer(personId: string): Promise<CaseViewer> {
  const sql = useDatabase()
  const [isCommittee, groups] = await Promise.all([
    isCommitteeMember(personId),
    sql`SELECT group_id FROM memberships WHERE person_id = ${personId}` as Promise<any[]>,
  ])
  return { personId, groupIds: groups.map((g) => g.group_id), isCommittee, preview: null }
}

// --- Role preview ("Se som ...") ------------------------------------------------------

/** No person: a preview viewer owns no question, comment, ballot or conflict. */
const NOBODY = '00000000-0000-0000-0000-000000000000'
/** `?som=ingen`: a portal member in no investing SPV. */
export const PREVIEW_NO_SPV = 'ingen'

export interface PreviewRole {
  /** an invest group slug, or PREVIEW_NO_SPV */
  slug: string
  name: string | null
  phase: string | null
}

/** The roles a committee member can preview: one per invest group, then "no SPV". */
export async function previewRoles(): Promise<PreviewRole[]> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT slug, name, invest_phase FROM network_groups
    WHERE invest_phase IS NOT NULL
    ORDER BY (invest_phase = 'deploying') DESC, slug
  `) as any[]
  return [
    ...rows.map((r) => ({ slug: r.slug, name: r.name, phase: r.invest_phase })),
    { slug: PREVIEW_NO_SPV, name: null, phase: null },
  ]
}

/**
 * The viewer a role preview stands in for: a member of exactly that SPV (or of
 * none), not on the committee, owning nothing. Only the committee may preview, and a
 * preview can only see less than the real viewer, since the committee sees every case.
 * Every write route reads the real session, never `?som=`, so a preview cannot act.
 */
export async function viewerForRequest(event: H3Event): Promise<CaseViewer> {
  const viewer = await caseViewer(event.context.session.personId)
  const som = getQuery(event).som
  if (typeof som !== 'string' || !som) return viewer
  if (!viewer.isCommittee) throw createError({ statusCode: 403, message: 'Committee only' })
  // `aktiv` (the nav's "Se som ..."): the SPV investing now, else the first role.
  const roles = await previewRoles()
  const role =
    som === 'aktiv' ? (roles.find((r) => r.phase === 'deploying') ?? roles[0]) : roles.find((r) => r.slug === som)
  if (!role) throw createError({ statusCode: 400, message: 'Unknown role' })
  const sql = useDatabase()
  const group =
    role.slug === PREVIEW_NO_SPV ? [] : ((await sql`SELECT id FROM network_groups WHERE slug = ${role.slug}`) as any[])
  return { personId: NOBODY, groupIds: group.map((g) => g.id), isCommittee: false, preview: role }
}

/** Documents are listed raw inputs first and the memo last (plan §7a: the members
 *  who default to blank asked for the raw material, not a better narrative). */
const DOCUMENT_ORDER = ['deck', 'cto-call-notes', 'company-data', 'qa-log', 'numbers', 'memo']

function documentRank(key: string): number {
  const i = DOCUMENT_ORDER.indexOf(key)
  return i === -1 ? DOCUMENT_ORDER.length - 1 : i
}

/**
 * The access rule as one SQL condition over `pd` (pipeline_deals). Kept in one
 * place so the list, the case page and the document download cannot drift apart.
 */
function caseVisibleSql(sql: ReturnType<typeof useDatabase>, viewer: CaseViewer) {
  if (viewer.isCommittee) {
    return sql`(pd.investor_visible OR pd.status = ANY(${ACTIVE_STATUSES})
                OR EXISTS (SELECT 1 FROM deal_rounds r0 WHERE r0.deal_id = pd.id))`
  }
  const groups = viewer.groupIds
  return sql`(
    ((pd.investor_visible OR pd.status = ANY(${ACTIVE_STATUSES}))
      AND NOT EXISTS (SELECT 1 FROM investments i0 WHERE i0.deal_id = pd.id)
      AND EXISTS (
        SELECT 1 FROM network_groups g
        WHERE g.id = ANY(${groups}::uuid[]) AND g.invest_phase = 'deploying'))
    OR EXISTS (
      SELECT 1 FROM deal_rounds r0
      WHERE r0.deal_id = pd.id AND r0.status IN ('open', 'closed') AND r0.group_id = ANY(${groups}::uuid[]))
    OR ((pd.investor_visible OR EXISTS (SELECT 1 FROM deal_rounds r1 WHERE r1.deal_id = pd.id AND r1.status <> 'draft'))
        AND EXISTS (
          SELECT 1 FROM investments i
          WHERE i.deal_id = pd.id AND i.group_id = ANY(${groups}::uuid[])))
  )`
}

/** Whether the blurb and the documents of a visible case are shared with this viewer. */
function materialSharedSql(sql: ReturnType<typeof useDatabase>, viewer: CaseViewer) {
  return sql`(${viewer.isCommittee} OR pd.investor_visible
              OR EXISTS (SELECT 1 FROM deal_rounds r2 WHERE r2.deal_id = pd.id AND r2.status <> 'draft'))`
}

/** Whether this viewer may see any case at all: decides the "Caser" nav item. */
export async function canSeeCases(personId: string): Promise<boolean> {
  const viewer = await caseViewer(personId)
  if (viewer.isCommittee) return true
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

// --- The cases overview (/member/caser) ----------------------------------------------

/**
 * A reviewing or waiting case with no activity for this long is "inactive": it moves
 * to the collapsed list at the bottom of the overview. 8 weeks, picked from the data
 * on 2026-10-29: the live cases had activity within 7 weeks, the next one back was
 * 9 weeks old, and the long tail went back to 2025.
 */
export const INACTIVE_AFTER_DAYS = 56

/** Which overview section a case belongs in; null = not current work (shown on request). */
export type CaseSection = 'decided' | 'active' | 'inactive'

export function caseSection(c: {
  status: string
  lastActivityAt: string | null
  round: CaseRound | null
}): CaseSection | null {
  if (c.status === 'pending_transfer') return 'decided'
  if (c.round?.status === 'open' || c.status === 'to_be_voted') return 'active'
  if (c.status !== 'reviewing' && c.status !== 'waiting') return null
  const last = c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : 0
  return Date.now() - last <= INACTIVE_AFTER_DAYS * 86_400_000 ? 'active' : 'inactive'
}

export interface CaseRound {
  status: string
  result: string | null
  closesAt: string | null
  closedAt: string | null
  group: { slug: string; name: string }
}

export interface CaseRow {
  slug: string
  name: string
  status: string
  /** only when the material is shared (materialSharedSql) */
  blurb: string | null
  owner: string | null
  /** last_activity_at, else updated_at */
  lastActivityAt: string | null
  /** the open round, else the newest this viewer may see */
  round: CaseRound | null
  /** an SPV this viewer is in invested in it */
  ours: boolean
  /** the case page opens for this viewer (always, except some declined rows) */
  canOpen: boolean
}

/** The columns of a CaseRow over `pd`, `o` and `owner`. */
function caseRowColumns(sql: ReturnType<typeof useDatabase>, viewer: CaseViewer) {
  return sql`
    pd.slug, o.name, pd.status, COALESCE(pd.last_activity_at, pd.updated_at) AS last_activity_at,
    owner.name AS owner_name,
    CASE WHEN ${materialSharedSql(sql, viewer)} THEN pd.investor_blurb END AS investor_blurb,
    EXISTS (SELECT 1 FROM investments i WHERE i.deal_id = pd.id AND i.group_id = ANY(${viewer.groupIds}::uuid[])) AS ours,
    EXISTS (SELECT 1 FROM investments i WHERE i.deal_id = pd.id) AS invested,
    (SELECT json_build_object('status', r.status, 'result', r.result, 'closesAt', r.closes_at, 'closedAt', r.closed_at,
                              'group', json_build_object('slug', ng.slug, 'name', ng.name))
     FROM deal_rounds r JOIN network_groups ng ON ng.id = r.group_id
     WHERE r.deal_id = pd.id AND (${viewer.isCommittee} OR r.status IN ('open', 'closed'))
     ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 1) AS round`
}

function caseRowOut(r: any): CaseRow {
  return {
    slug: r.slug,
    name: r.name,
    status: r.status,
    blurb: r.investor_blurb,
    owner: r.owner_name,
    lastActivityAt: r.last_activity_at,
    round: r.round,
    ours: r.ours,
    canOpen: r.can_open ?? true,
  }
}

/** Open vote first, then up for a vote, in review, waiting; then the newest activity. */
function byUrgency(a: CaseRow, b: CaseRow) {
  const rank = (c: CaseRow) =>
    c.round?.status === 'open' ? -1 : ['to_be_voted', 'reviewing', 'waiting'].indexOf(c.status)
  return (
    rank(a) - rank(b) ||
    new Date(b.lastActivityAt ?? 0).getTime() - new Date(a.lastActivityAt ?? 0).getTime() ||
    a.name.localeCompare(b.name)
  )
}

export interface CaseOverview {
  /** the investing SPV(s) this viewer is in: who sees the working pipeline (dc-33 H2) */
  audience: string[]
  /** decided, money on its way (pending_transfer) */
  decided: CaseRow[]
  /** an open vote, up for a vote, or reviewing/waiting with recent activity */
  active: CaseRow[]
  /** reviewing/waiting, quiet for INACTIVE_AFTER_DAYS */
  inactive: CaseRow[]
  /** what this viewer's SPVs invested in */
  invested: CaseRow[]
  /** on request: the companies we said no to, and votes that ended without an investment */
  declined: CaseRow[] | null
  inactiveAfterDays: number
}

/**
 * The one cases overview (decision 2026-10-22 §6, dc-33 2026-10-23, Snorre's
 * feedback 2026-10-29): the ACTIVE SPV sees all active work, in three sections
 * (decided, under review now, inactive); a COMPLETED SPV sees only the companies it
 * invested in. Which deals count is the case rule (caseVisibleSql), so the overview,
 * the case page and its actions never disagree. With `declined`, also the companies
 * the committee said no to (on request, dc-33 H1), for the same people who see the
 * working pipeline.
 */
export async function listCaseOverview(
  viewer: CaseViewer,
  opts: { declined: boolean } = { declined: false },
): Promise<CaseOverview> {
  const sql = useDatabase()
  const activeGroups = (await sql`
    SELECT g.name FROM network_groups g
    WHERE g.invest_phase = 'deploying' AND g.id = ANY(${viewer.groupIds}::uuid[])
    ORDER BY g.name
  `) as any[]
  const [rows, declinedRows] = await Promise.all([
    sql`
      SELECT ${caseRowColumns(sql, viewer)}
      FROM pipeline_deals pd
      JOIN organizations o ON o.id = pd.organization_id
      LEFT JOIN persons owner ON owner.id = pd.driver_person_id
      WHERE pd.slug IS NOT NULL AND ${caseVisibleSql(sql, viewer)}
    ` as Promise<any[]>,
    opts.declined && activeGroups.length
      ? (sql`
          SELECT ${caseRowColumns(sql, viewer)}, ${caseVisibleSql(sql, viewer)} AS can_open
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
  const out: CaseOverview = {
    audience: activeGroups.map((g) => g.name),
    decided: [],
    active: [],
    inactive: [],
    invested: [],
    declined: null,
    inactiveAfterDays: INACTIVE_AFTER_DAYS,
  }
  // Visible, not invested, not current work: a vote that ended without an investment.
  const ended: CaseRow[] = []
  for (const r of rows) {
    const row = caseRowOut(r)
    if (r.invested) {
      if (r.ours || viewer.isCommittee) out.invested.push(row)
      continue
    }
    const section = caseSection(row)
    if (section) out[section].push(row)
    else ended.push(row)
  }
  for (const list of [out.decided, out.active, out.inactive, out.invested]) list.sort(byUrgency)
  if (declinedRows) {
    const seen = new Set(declinedRows.map((r) => r.slug))
    out.declined = [...declinedRows.map(caseRowOut), ...ended.filter((r) => !seen.has(r.slug))]
  }
  return out
}
