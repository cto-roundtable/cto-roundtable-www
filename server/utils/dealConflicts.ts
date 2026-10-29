/**
 * "Jeg er inhabil": a member's own §9 conflict on a company (mandate Vedlegg 3 §9:
 * a member employed by, or otherwise tied to, a company "må da stemme blankt, eller
 * avstå fra å stemme"). Table deal_conflicts (ctoroundtable-hq migration 033).
 * dc-33 H3, 2026-10-23.
 *
 * A declared conflict freezes into the roster when a round opens (freezeRoster in
 * dealRounds.ts), and from then on the member can only vote blank on that company.
 * The member can withdraw it until a round is open; the row is kept with
 * withdrawn_at, and declaring again clears it. Who declared is shown to the
 * committee, never to other members (the board sees what a member sees).
 */

export const MAX_CONFLICT_REASON = 500

export interface Conflict {
  declaredAt: string
  reason: string | null
}

/** This member's standing conflict on the deal, or null. */
export async function myConflict(personId: string, dealId: string): Promise<Conflict | null> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT declared_at, reason FROM deal_conflicts
    WHERE deal_id = ${dealId} AND person_id = ${personId} AND withdrawn_at IS NULL
  `) as any[]
  return rows[0] ? { declaredAt: rows[0].declared_at, reason: rows[0].reason } : null
}

/** Everyone with a standing conflict on the deal, for the committee's view of the case. */
export async function listConflicts(dealId: string) {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT c.person_id, p.name, c.declared_at, c.reason
    FROM deal_conflicts c JOIN persons p ON p.id = c.person_id
    WHERE c.deal_id = ${dealId} AND c.withdrawn_at IS NULL
    ORDER BY c.declared_at
  `) as any[]
  return rows.map((r) => ({
    person: { id: r.person_id, name: r.name },
    declaredAt: r.declared_at,
    reason: r.reason,
  }))
}

/** The person ids with a standing conflict on the deal (for freezing a roster). */
export async function conflictedPersonIds(dealId: string): Promise<Set<string>> {
  const sql = useDatabase()
  const rows = (await sql`
    SELECT person_id FROM deal_conflicts WHERE deal_id = ${dealId} AND withdrawn_at IS NULL
  `) as any[]
  return new Set(rows.map((r) => r.person_id))
}

async function hasOpenRound(dealId: string) {
  const sql = useDatabase()
  const rows = await sql`SELECT 1 FROM deal_rounds WHERE deal_id = ${dealId} AND status = 'open' LIMIT 1`
  return rows.length > 0
}

/**
 * Declare (or re-declare) a conflict. Allowed while a round is open too, but it
 * does not reach that round's frozen roster: the page says so, and the committee
 * sees it on the case.
 */
export async function declareConflict(personId: string, dealId: string, body: Record<string, unknown>) {
  const extra = Object.keys(body).filter((k) => k !== 'reason')
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown keys: ${extra.join(', ')}` })
  let reason: string | null = null
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== 'string' || body.reason.length > MAX_CONFLICT_REASON) {
      throw createError({ statusCode: 400, message: `reason must be text of at most ${MAX_CONFLICT_REASON}` })
    }
    reason = body.reason.trim() || null
  }
  const sql = useDatabase()
  const rows = (await sql`
    INSERT INTO deal_conflicts (deal_id, person_id, reason)
    VALUES (${dealId}, ${personId}, ${reason})
    ON CONFLICT (deal_id, person_id) DO UPDATE
      SET reason = EXCLUDED.reason, declared_at = NOW(), withdrawn_at = NULL
    RETURNING declared_at, reason
  `) as any[]
  return {
    conflict: { declaredAt: rows[0].declared_at, reason: rows[0].reason },
    openRound: await hasOpenRound(dealId),
  }
}

/** Withdraw a conflict. Refused while a round is open: the roster is frozen then. */
export async function withdrawConflict(personId: string, dealId: string) {
  if (await hasOpenRound(dealId)) {
    throw createError({
      statusCode: 409,
      message: 'A vote is open on this company; the conflict stands until it closes',
    })
  }
  const sql = useDatabase()
  const rows = await sql`
    UPDATE deal_conflicts SET withdrawn_at = NOW()
    WHERE deal_id = ${dealId} AND person_id = ${personId} AND withdrawn_at IS NULL
    RETURNING deal_id
  `
  if (!rows.length) throw createError({ statusCode: 404, message: 'No conflict to withdraw' })
  return { ok: true }
}
