/**
 * Comments and questions on an offering's documents (the CTORI4 deck), and the
 * committee's replies. Table invest_document_comments (ctoroundtable-hq migration 043).
 * All SQL for it lives here; the offering check (requireVisibleOffering) runs first.
 *
 * Who sees what. The committee runs investment matters and the board (`styret`) is
 * network only (Snorre, 2026-10-29), so the board gets nothing extra here:
 *   - the investment committee (`current-komite`) sees every thread on every version
 *     of the document, with names, and is the only one that replies;
 *   - a member sees their own threads, with every reply on them;
 *   - a reply the committee marks public ("for alle") is shown to every member who
 *     can see the offering, with the question it answers, WITHOUT the asker's name.
 * A member never sees which committee member replied: the reply is "the committee".
 * The filtering happens in SQL, so a row a viewer may not see never leaves the database.
 *
 * A comment is written on the CURRENT version of the document and stays tied to that
 * version (document_id), so a new deck keeps the old comments readable. Its anchor is
 * an element id in that version (a slide, `slide-4`), checked against the document's
 * own sections, or null for the whole document.
 */

export const DOCUMENT_COMMENT_KINDS = ['question', 'comment'] as const
export type DocumentCommentKind = (typeof DOCUMENT_COMMENT_KINDS)[number]
export const MAX_DOCUMENT_COMMENT = 4000
export const MAX_DOCUMENT_QUOTE = 300
/** Comments and replies one person may write in an hour, across all documents. */
const MAX_PER_HOUR = 20

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface OutlinePart {
  id: string
  title: string
}

export interface DocumentReply {
  id: string
  body: string
  public: boolean
  createdAt: string
  withdrawnAt: string | null
  mine: boolean
  /** committee only */
  author?: { name: string }
}

export interface DocumentThread {
  id: string
  kind: DocumentCommentKind
  anchor: string | null
  /** The anchored part's title in the version it was written on. */
  anchorTitle: string | null
  quote: string | null
  body: string
  version: number
  createdAt: string
  withdrawnAt: string | null
  mine: boolean
  /** Some reply on it is shown to every member. */
  public: boolean
  replies: DocumentReply[]
  /** committee only */
  author?: { name: string }
}

/** The investment committee reads every thread with names and replies. One place to change it. */
export function isDocumentCommentReader(personId: string): Promise<boolean> {
  return isCommitteeMember(personId)
}

// The outline of a version never changes (a version's bytes are fixed), so it is
// kept per sha256 for the life of the server.
const outlineCache = new Map<string, OutlinePart[]>()

/**
 * The parts a comment can point at: every element with an id that is a <section>
 * (the deck's slides), titled by its first heading. A document without sections has
 * no parts; comments on it are on the whole document.
 */
export function documentOutline(html: string): OutlinePart[] {
  const parts: OutlinePart[] = []
  const re = /<section\b[^>]*\bid\s*=\s*["']([A-Za-z][A-Za-z0-9_-]{0,63})["'][^>]*>([\s\S]*?)(?=<section\b|$)/gi
  for (const m of html.matchAll(re)) {
    const heading = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(m[2] ?? '')
    const title = heading ? textOf(heading[1] ?? '') : ''
    parts.push({ id: m[1] as string, title: title.slice(0, 140) })
  }
  return parts
}

function textOf(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function outlinesFor(offeringId: string, key: string): Promise<Map<number, OutlinePart[]>> {
  const sql = useDatabase()
  const versions = await sql`
    SELECT version, sha256 FROM invest_offering_documents
    WHERE offering_id = ${offeringId} AND key = ${key}
  `
  const missing = versions.filter((v: any) => !outlineCache.has(v.sha256)).map((v: any) => v.version as number)
  if (missing.length) {
    const rows = await sql`
      SELECT sha256, content_type, body FROM invest_offering_documents
      WHERE offering_id = ${offeringId} AND key = ${key} AND version = ANY(${missing})
    `
    for (const r of rows as any[]) {
      const html = String(r.content_type).startsWith('text/html') ? toText(r.body) : ''
      outlineCache.set(r.sha256, documentOutline(html))
    }
  }
  return new Map(versions.map((v: any) => [v.version as number, outlineCache.get(v.sha256) ?? []]))
}

/** bytea comes back as a hex string ("\x…") or a Uint8Array, depending on the driver path. */
function toText(v: unknown): string {
  if (typeof v === 'string') return Buffer.from(v.startsWith('\\x') ? v.slice(2) : v, 'hex').toString('utf8')
  return Buffer.from(v as Uint8Array).toString('utf8')
}

/** The current version of a document (id, version and its outline), or a 404. */
async function currentVersion(offeringId: string, key: string) {
  const sql = useDatabase()
  const rows = await sql`
    SELECT id, version FROM invest_offering_documents
    WHERE offering_id = ${offeringId} AND key = ${key}
    ORDER BY version DESC
    LIMIT 1
  `
  const r = rows[0] as any
  if (!r) throw createError({ statusCode: 404, message: 'Not found' })
  const outlines = await outlinesFor(offeringId, key)
  return { id: r.id as string, version: r.version as number, outline: outlines.get(r.version) ?? [] }
}

/**
 * What this viewer may see on one document: the current version's outline, and the
 * threads (oldest first), on every version.
 */
export async function listDocumentThreads(
  viewer: { personId: string; isCommittee: boolean },
  offeringId: string,
  key: string,
): Promise<{ version: number; outline: OutlinePart[]; threads: DocumentThread[] }> {
  const current = await currentVersion(offeringId, key)
  const outlines = await outlinesFor(offeringId, key)
  const sql = useDatabase()
  const rows = await sql`
    SELECT c.id, c.parent_id, c.kind, c.anchor, c.quote, c.body, c.public, c.withdrawn_at, c.created_at,
           c.author_person_id, p.name AS author_name, d.version
    FROM invest_document_comments c
    JOIN invest_offering_documents d ON d.id = c.document_id
    JOIN persons p ON p.id = c.author_person_id
    LEFT JOIN invest_document_comments root ON root.id = c.parent_id
    WHERE d.offering_id = ${offeringId} AND d.key = ${key}
      AND (
        ${viewer.isCommittee}
        OR COALESCE(root.author_person_id, c.author_person_id) = ${viewer.personId}
        OR (c.parent_id IS NULL AND c.withdrawn_at IS NULL AND EXISTS (
              SELECT 1 FROM invest_document_comments x
              WHERE x.parent_id = c.id AND x.public AND x.withdrawn_at IS NULL))
        OR (c.parent_id IS NOT NULL AND c.public AND c.withdrawn_at IS NULL AND root.withdrawn_at IS NULL)
      )
    ORDER BY c.created_at, c.id
  `
  const threads: DocumentThread[] = []
  const byId = new Map<string, DocumentThread>()
  for (const r of rows as any[]) {
    if (r.parent_id) continue
    const outline = outlines.get(r.version) ?? []
    const mine = r.author_person_id === viewer.personId
    const t: DocumentThread = {
      id: r.id,
      kind: r.kind,
      anchor: r.anchor,
      anchorTitle: r.anchor ? (outline.find((o) => o.id === r.anchor)?.title ?? null) : null,
      quote: r.quote,
      body: r.body,
      version: r.version,
      createdAt: r.created_at,
      withdrawnAt: r.withdrawn_at,
      mine,
      public: false,
      replies: [],
      ...(viewer.isCommittee ? { author: { name: r.author_name } } : {}),
    }
    threads.push(t)
    byId.set(t.id, t)
  }
  for (const r of rows as any[]) {
    if (!r.parent_id) continue
    const t = byId.get(r.parent_id)
    if (!t) continue
    // A member sees withdrawn replies nowhere; the committee sees them, marked.
    if (r.withdrawn_at && !viewer.isCommittee) continue
    // A withdrawn question is shown to nobody but its author and the committee, so it is not "for everyone".
    if (r.public && !r.withdrawn_at && !t.withdrawnAt) t.public = true
    t.replies.push({
      id: r.id,
      body: r.body,
      public: r.public,
      createdAt: r.created_at,
      withdrawnAt: r.withdrawn_at,
      mine: r.author_person_id === viewer.personId,
      ...(viewer.isCommittee ? { author: { name: r.author_name } } : {}),
    })
  }
  return { version: current.version, outline: current.outline, threads }
}

function cleanBody(value: unknown, max: number, errorKey: string): string {
  if (typeof value !== 'string' || !value.trim()) throw createError({ statusCode: 400, message: errorKey })
  const body = value.replace(/\r\n/g, '\n').trim()
  if (body.length > max) throw createError({ statusCode: 400, message: 'invest.comments.errors.tooLong' })
  return body
}

async function underRateLimit(personId: string) {
  const sql = useDatabase()
  const recent = await sql`
    SELECT COUNT(*)::int AS n FROM invest_document_comments
    WHERE author_person_id = ${personId} AND created_at > NOW() - interval '1 hour'
  `
  if ((recent[0] as any).n >= MAX_PER_HOUR) {
    throw createError({ statusCode: 429, message: 'invest.comments.errors.tooMany' })
  }
}

/** A member (or the committee) writes a comment or question on the current version. */
export async function addDocumentComment(
  personId: string,
  offeringId: string,
  key: string,
  input: { kind?: unknown; body?: unknown; anchor?: unknown; quote?: unknown },
): Promise<{ id: string }> {
  if (!DOCUMENT_COMMENT_KINDS.includes(input.kind as DocumentCommentKind)) {
    throw createError({ statusCode: 400, message: 'invest.comments.errors.kind' })
  }
  const body = cleanBody(input.body, MAX_DOCUMENT_COMMENT, 'invest.comments.errors.body')
  const current = await currentVersion(offeringId, key)
  let anchor: string | null = null
  if (input.anchor !== undefined && input.anchor !== null && input.anchor !== '') {
    if (typeof input.anchor !== 'string' || !current.outline.some((o) => o.id === input.anchor)) {
      throw createError({ statusCode: 400, message: 'invest.comments.errors.anchor' })
    }
    anchor = input.anchor
  }
  let quote: string | null = null
  if (typeof input.quote === 'string' && input.quote.trim()) {
    quote = input.quote.replace(/\s+/g, ' ').trim()
    if (quote.length > MAX_DOCUMENT_QUOTE)
      throw createError({ statusCode: 400, message: 'invest.comments.errors.quote' })
  }
  await underRateLimit(personId)
  const sql = useDatabase()
  const rows = await sql`
    INSERT INTO invest_document_comments (document_id, kind, anchor, quote, body, author_person_id)
    VALUES (${current.id}, ${input.kind as string}, ${anchor}, ${quote}, ${body}, ${personId})
    RETURNING id
  `
  return { id: (rows[0] as any).id }
}

/** A comment of this offering, or a 404 (also for an id from another offering). */
async function commentOf(offeringId: string, commentId: string) {
  if (!UUID.test(commentId)) throw createError({ statusCode: 404, message: 'Not found' })
  const sql = useDatabase()
  const rows = await sql`
    SELECT c.id, c.parent_id, c.document_id, c.author_person_id, c.withdrawn_at
    FROM invest_document_comments c
    JOIN invest_offering_documents d ON d.id = c.document_id
    WHERE c.id = ${commentId} AND d.offering_id = ${offeringId}
  `
  const r = rows[0] as any
  if (!r) throw createError({ statusCode: 404, message: 'Not found' })
  return r as {
    id: string
    parent_id: string | null
    document_id: string
    author_person_id: string
    withdrawn_at: string | null
  }
}

/** The committee replies to a comment or question, for its author only or for everyone. */
export async function replyToDocumentComment(
  personId: string,
  offeringId: string,
  commentId: string,
  input: { body?: unknown; public?: unknown },
): Promise<{ id: string }> {
  const root = await commentOf(offeringId, commentId)
  if (root.parent_id) throw createError({ statusCode: 400, message: 'invest.comments.errors.replyToReply' })
  if (root.withdrawn_at) throw createError({ statusCode: 409, message: 'invest.comments.errors.withdrawn' })
  const body = cleanBody(input.body, MAX_DOCUMENT_COMMENT, 'invest.comments.errors.body')
  await underRateLimit(personId)
  const sql = useDatabase()
  const rows = await sql`
    INSERT INTO invest_document_comments (document_id, parent_id, kind, body, author_person_id, public)
    VALUES (${root.document_id}, ${root.id}, 'reply', ${body}, ${personId}, ${input.public === true})
    RETURNING id
  `
  return { id: (rows[0] as any).id }
}

/** The committee shows a reply to every member, or takes it back. */
export async function setDocumentReplyPublic(offeringId: string, replyId: string, value: unknown): Promise<void> {
  if (typeof value !== 'boolean') throw createError({ statusCode: 400, message: 'invest.comments.errors.unknown' })
  const reply = await commentOf(offeringId, replyId)
  if (!reply.parent_id) throw createError({ statusCode: 400, message: 'invest.comments.errors.notReply' })
  const sql = useDatabase()
  await sql`UPDATE invest_document_comments SET public = ${value} WHERE id = ${reply.id}`
}

/** The author withdraws their own comment or reply. The row stays, marked. */
export async function withdrawDocumentComment(personId: string, offeringId: string, commentId: string): Promise<void> {
  const c = await commentOf(offeringId, commentId)
  if (c.author_person_id !== personId || c.withdrawn_at) throw createError({ statusCode: 404, message: 'Not found' })
  const sql = useDatabase()
  await sql`UPDATE invest_document_comments SET withdrawn_at = NOW() WHERE id = ${c.id} AND withdrawn_at IS NULL`
}

/** Per document key: threads with no reply yet (the committee's to-do), for the offering page. */
export async function unansweredDocumentThreads(offeringId: string): Promise<Record<string, number>> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT d.key, COUNT(*)::int AS n
    FROM invest_document_comments c
    JOIN invest_offering_documents d ON d.id = c.document_id
    WHERE d.offering_id = ${offeringId} AND c.parent_id IS NULL AND c.withdrawn_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM invest_document_comments r
                      WHERE r.parent_id = c.id AND r.withdrawn_at IS NULL)
    GROUP BY d.key
  `
  return Object.fromEntries((rows as any[]).map((r) => [r.key, r.n]))
}
