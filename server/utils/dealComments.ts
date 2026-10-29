/**
 * Input on a case that does not count: comments, objections, suggestions,
 * questions for the founder, and "I know them" signals. Table deal_comments
 * (ctoroundtable-hq migration 032). All comment SQL lives here.
 *
 * Who sees what (decision 2026-10-22 on the vote model, project ctori-4, §5):
 *   - the committee sees every comment WITH the author's name;
 *   - a member sees only their own comments, never anyone else's, so nobody is
 *     steered by what others are putting in;
 *   - the digest agent reads them, names included, through GET /api/admin/comments.
 * Nothing is sealed or hidden in the database: the row holds the author. A
 * member can withdraw their own comment; the row is kept with withdrawn_at.
 */

export const COMMENT_KINDS = ['comment', 'objection', 'suggestion', 'founder_question', 'signal'] as const
export type CommentKind = (typeof COMMENT_KINDS)[number]
export const MAX_COMMENT = 8000

export interface CaseComment {
  id: string
  kind: CommentKind
  body: string
  createdAt: string
  withdrawnAt: string | null
  mine: boolean
  /** staff only */
  author?: { id: string; name: string }
}

/**
 * The comments on a case this viewer may see, newest first: staff get all with
 * names (withdrawn ones included, marked), a member gets their own.
 */
export async function listCaseComments(viewer: CaseViewer, dealId: string): Promise<CaseComment[]> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT c.id, c.kind, c.body, c.created_at, c.withdrawn_at, c.author_person_id, p.name AS author_name
    FROM deal_comments c
    JOIN persons p ON p.id = c.author_person_id
    WHERE c.deal_id = ${dealId}
      AND (${viewer.isCommittee} OR c.author_person_id = ${viewer.personId})
    ORDER BY c.created_at DESC
  `
  return (rows as any[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    createdAt: r.created_at,
    withdrawnAt: r.withdrawn_at,
    mine: r.author_person_id === viewer.personId,
    ...(viewer.isCommittee ? { author: { id: r.author_person_id, name: r.author_name } } : {}),
  }))
}

/** A member writes. The case check has already passed. Ties it to the open round, if any. */
export async function addComment(
  personId: string,
  dealId: string,
  input: { kind: unknown; body: unknown },
): Promise<{ id: string }> {
  if (!COMMENT_KINDS.includes(input.kind as CommentKind)) {
    throw createError({ statusCode: 400, message: `kind must be one of ${COMMENT_KINDS.join(', ')}` })
  }
  if (typeof input.body !== 'string' || !input.body.trim()) {
    throw createError({ statusCode: 400, message: 'The comment is required' })
  }
  const body = input.body.replace(/\r\n/g, '\n').trim()
  if (body.length > MAX_COMMENT) {
    throw createError({ statusCode: 400, message: `The comment is at most ${MAX_COMMENT} characters` })
  }
  const sql = useDatabase()
  const recent = await sql`
    SELECT COUNT(*)::int AS n FROM deal_comments
    WHERE author_person_id = ${personId} AND created_at > NOW() - interval '1 hour'
  `
  if ((recent[0] as any).n >= 20) {
    throw createError({ statusCode: 429, message: 'That is a lot of comments in an hour. Try again later.' })
  }
  const rows = await sql`
    INSERT INTO deal_comments (deal_id, round_id, kind, body, author_person_id)
    VALUES (
      ${dealId},
      (SELECT id FROM deal_rounds WHERE deal_id = ${dealId} AND status = 'open' ORDER BY opened_at DESC LIMIT 1),
      ${input.kind as string},
      ${body},
      ${personId}
    )
    RETURNING id
  `
  return { id: (rows[0] as any).id }
}

/** The author withdraws their own comment. The row stays, marked. */
export async function withdrawComment(personId: string, dealId: string, commentId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(commentId)) throw createError({ statusCode: 404, message: 'Comment not found' })
  const sql = useDatabase()
  const rows = await sql`
    UPDATE deal_comments SET withdrawn_at = NOW()
    WHERE id = ${commentId} AND deal_id = ${dealId} AND author_person_id = ${personId} AND withdrawn_at IS NULL
    RETURNING id
  `
  if (rows.length === 0) throw createError({ statusCode: 404, message: 'Comment not found' })
}
