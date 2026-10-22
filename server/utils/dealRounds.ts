import { createHash } from 'node:crypto'

/**
 * Decision rounds on a deal: one per (deal, SPV group, attempt). Table
 * deal_rounds (ctoroundtable-hq migration 032). All round SQL lives here.
 *
 * A round is created as a draft (`ctr deals publish`, POST /api/admin/deals/:slug/rounds)
 * with a SNAPSHOT of what it is about: the proposal and the current version of
 * each named document, hashed together into bundle_sha256, which every ballot
 * attests to. The rules are set here, never by the caller: model A+, 48 hours
 * flat, 2/3 of yes + no, live counts to members and named ballots to the
 * committee only (decision 2026-10-22 on the vote model, project ctori-4).
 */

export const ROUND_RULES = {
  threshold: '2/3',
  base: 'yes+no',
  excluded: ['blank', 'none'],
  weighting: 'person',
  window_h: 48,
  ballot: 'choices_board_only',
  mandate: null,
} as const

const PROPOSAL_KEYS = ['amount', 'currency', 'instrument', 'cap', 'termsSummary']

export interface Proposal {
  amount: number
  currency: string
  instrument: string
  cap: number | null
  termsSummary: string | null
}

/** Validate what the SPV is asked to approve. 400 on anything off. */
export function cleanProposal(value: unknown): Proposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createError({ statusCode: 400, message: 'proposal must be an object' })
  }
  const p = value as Record<string, unknown>
  const extra = Object.keys(p).filter((k) => !PROPOSAL_KEYS.includes(k))
  if (extra.length) throw createError({ statusCode: 400, message: `Unknown proposal keys: ${extra.join(', ')}` })
  if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) {
    throw createError({ statusCode: 400, message: 'proposal.amount must be a positive number' })
  }
  if (typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency)) {
    throw createError({ statusCode: 400, message: 'proposal.currency must be a three-letter code (NOK)' })
  }
  if (typeof p.instrument !== 'string' || !p.instrument.trim() || p.instrument.length > 80) {
    throw createError({ statusCode: 400, message: 'proposal.instrument is required (at most 80 characters)' })
  }
  if (p.cap !== undefined && p.cap !== null && (typeof p.cap !== 'number' || !Number.isFinite(p.cap) || p.cap <= 0)) {
    throw createError({ statusCode: 400, message: 'proposal.cap must be a positive number or null' })
  }
  if (p.termsSummary !== undefined && p.termsSummary !== null) {
    if (typeof p.termsSummary !== 'string' || p.termsSummary.length > 2000) {
      throw createError({ statusCode: 400, message: 'proposal.termsSummary is at most 2000 characters' })
    }
  }
  return {
    amount: p.amount,
    currency: p.currency,
    instrument: p.instrument.trim(),
    cap: (p.cap as number | null | undefined) ?? null,
    termsSummary: typeof p.termsSummary === 'string' && p.termsSummary.trim() ? p.termsSummary.trim() : null,
  }
}

/** JSON with sorted keys, so the same content always hashes the same. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export interface RoundDocument {
  key: string
  title: string
  version: number
  sha256: string
}

/** sha256 over the documents (key order) and the proposal: what a ballot attests to. */
export function bundleSha256(documents: RoundDocument[], proposal: Proposal): string {
  const docs = [...documents]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((d) => ({ key: d.key, version: d.version, sha256: d.sha256 }))
  return createHash('sha256')
    .update(canonicalJson({ documents: docs, proposal }))
    .digest('hex')
}

/** The round object of the admin API (memory votes/admin-api.md). */
export function roundObject(r: any) {
  const rules = r.rules ?? {}
  return {
    id: r.id,
    deal: { slug: r.deal_slug, name: r.deal_name },
    group: r.group_slug,
    kind: r.kind,
    status: r.status,
    source: r.source,
    rules: {
      threshold: rules.threshold ?? null,
      base: rules.base ?? null,
      excluded: rules.excluded ?? [],
      weighting: rules.weighting ?? null,
      windowH: rules.window_h ?? null,
      ballot: rules.ballot ?? null,
      mandate: rules.mandate ?? null,
    },
    proposal: r.proposal,
    documents: r.documents,
    bundleSha256: r.bundle_sha256,
    openedAt: r.opened_at,
    closesAt: r.closes_at,
    closedAt: r.closed_at,
    cancelReason: r.cancel_reason,
    result: r.result,
    tally: null,
    protocol: r.result_sha256 ? { sha256: r.result_sha256 } : null,
  }
}

export async function loadRound(roundId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(roundId)) return null
  const sql = useDatabase()
  const rows = await sql`
    SELECT r.*, pd.slug AS deal_slug, o.name AS deal_name, ng.slug AS group_slug
    FROM deal_rounds r
    JOIN pipeline_deals pd ON pd.id = r.deal_id
    JOIN organizations o ON o.id = pd.organization_id
    JOIN network_groups ng ON ng.id = r.group_id
    WHERE r.id = ${roundId}
  `
  return (rows[0] as any) ?? null
}

/**
 * A draft round on a deal for one SPV group. `documents` are keys of the deal's
 * CURRENT document versions. 409 if the deal already has a draft or open round
 * for that group (the 032 unique index is the backstop).
 */
export async function createDraftRound(
  dealId: string,
  input: { group: unknown; proposal: unknown; documents: unknown },
): Promise<ReturnType<typeof roundObject>> {
  if (typeof input.group !== 'string' || !input.group) {
    throw createError({ statusCode: 400, message: 'group is required (invest-N)' })
  }
  const proposal = cleanProposal(input.proposal)
  if (
    !Array.isArray(input.documents) ||
    input.documents.length === 0 ||
    input.documents.some((k) => typeof k !== 'string')
  ) {
    throw createError({ statusCode: 400, message: 'documents must be a non-empty list of document keys' })
  }
  const keys = [...new Set(input.documents as string[])]

  const sql = useDatabase()
  const groups = await sql`SELECT id, invest_phase FROM network_groups WHERE slug = ${input.group}`
  const group: any = groups[0]
  if (!group?.invest_phase) {
    throw createError({ statusCode: 400, message: `${input.group} is not an SPV group` })
  }
  if (group.invest_phase === 'completed') {
    throw createError({ statusCode: 400, message: `${input.group} is completed and makes no new investments` })
  }

  const docRows = await sql`
    SELECT DISTINCT ON (key) key, title, version, sha256
    FROM deal_documents
    WHERE deal_id = ${dealId} AND key = ANY(${keys})
    ORDER BY key, version DESC
  `
  const documents: RoundDocument[] = (docRows as any[]).map((d) => ({
    key: d.key,
    title: d.title,
    version: d.version,
    sha256: d.sha256,
  }))
  const missing = keys.filter((k) => !documents.some((d) => d.key === k))
  if (missing.length) {
    throw createError({ statusCode: 400, message: `No document uploaded for: ${missing.join(', ')}` })
  }

  const live = await sql`
    SELECT id, status FROM deal_rounds
    WHERE deal_id = ${dealId} AND group_id = ${group.id} AND status IN ('draft', 'open')
  `
  if (live.length) {
    throw createError({
      statusCode: 409,
      message: `The deal already has a ${(live[0] as any).status} round for ${input.group} (${(live[0] as any).id})`,
    })
  }

  let inserted: any[]
  try {
    inserted = (await sql`
      INSERT INTO deal_rounds (deal_id, group_id, kind, status, source, rules, proposal, documents, bundle_sha256)
      VALUES (${dealId}, ${group.id}, 'vote', 'draft', 'portal', ${JSON.stringify(ROUND_RULES)}::jsonb,
              ${JSON.stringify(proposal)}::jsonb, ${JSON.stringify(documents)}::jsonb,
              ${bundleSha256(documents, proposal)})
      RETURNING id
    `) as any[]
  } catch (err: any) {
    if (err?.code === '23505') {
      throw createError({ statusCode: 409, message: `The deal already has a draft or open round for ${input.group}` })
    }
    throw err
  }
  return roundObject(await loadRound(inserted[0].id))
}
