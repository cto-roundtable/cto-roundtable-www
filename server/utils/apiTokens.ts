import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { AuditEntry } from './audit'

/**
 * Machine access to portal data for agents: /api/admin/**, used by the `ctr`
 * CLI (cli/ctr.mjs). Table api_tokens
 * (ctoroundtable-hq/infrastructure/db/migrations/026_api_tokens_and_audit.sql).
 *
 * A token is `ctr_` + 43 base64url characters (32 random bytes), shown once:
 * issued by the device flow (`ctr login`, server/utils/deviceAuth.ts) or, as
 * break-glass, minted by scripts/mint-api-token.mjs. Only its sha256 is stored, so a
 * request is a hash lookup, not a comparison against a secret, and a leaked
 * database row cannot be replayed.
 *
 * A token works while ALL of these hold, checked on every request:
 *   - it is not revoked and not expired
 *   - it carries the scope the route needs (403 otherwise; every other
 *     problem is a 401, with no hint which)
 *   - its owner is an active person in `styret`. Leaving the board disables
 *     every token you answer for, the same way the session gate re-checks the
 *     cookie holder on every /api/member/ request.
 *
 * Every /api/admin/ request goes through defineAdminRoute, which writes one
 * api_audit_log row with the final status, refusals included.
 */

export const API_SCOPES = ['events:read', 'events:write', 'surveys:read', 'surveys:write'] as const
export type ApiScope = (typeof API_SCOPES)[number]

const TOKEN_RE = /^ctr_[A-Za-z0-9_-]{43}$/

export interface ApiCaller {
  tokenId: string
  tokenName: string
  ownerPersonId: string
  ownerName: string
  scopes: ApiScope[]
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** A new bearer token and the hash to store. Same shape as the mint script's. */
export function newApiToken(): { token: string; hash: string } {
  const token = `ctr_${randomBytes(32).toString('base64url')}`
  return { token, hash: hashApiToken(token) }
}

function unauthorized(audit: AuditEntry, reason: string): never {
  audit.summary.reason = reason
  throw createError({ statusCode: 401, message: 'Unauthorized' })
}

/**
 * Resolve the bearer token and check it allows `scope` (null = any valid token).
 * Fills the audit entry as it goes, so a refusal is logged with as much as was
 * known: the token id and owner once the hash matched a row, and why it failed.
 */
export async function requireApiToken(event: H3Event, scope: ApiScope | null, audit: AuditEntry): Promise<ApiCaller> {
  audit.scope = scope
  const header = getHeader(event, 'authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) unauthorized(audit, 'missing_token')
  if (!TOKEN_RE.test(token)) unauthorized(audit, 'malformed_token')

  const sql = useDatabase()
  const rows = await sql`
    SELECT t.id, t.name, t.owner_person_id, t.scopes, t.created_at, t.expires_at, t.last_used_at,
           t.revoked_at IS NOT NULL AS revoked,
           t.expires_at IS NOT NULL AND t.expires_at <= NOW() AS expired,
           p.name AS owner_name,
           p.status = 'active' AND EXISTS (
             SELECT 1
             FROM memberships m
             JOIN network_groups ng ON ng.id = m.group_id
             WHERE m.person_id = t.owner_person_id AND ng.slug = ${BOARD_GROUP}
           ) AS owner_on_board
    FROM api_tokens t
    JOIN persons p ON p.id = t.owner_person_id
    WHERE t.token_hash = ${hashApiToken(token)}
    LIMIT 1
  `
  const r: any = rows[0]
  if (!r) unauthorized(audit, 'unknown_token')
  audit.tokenId = r.id
  audit.ownerPersonId = r.owner_person_id
  if (r.revoked) unauthorized(audit, 'revoked')
  if (r.expired) unauthorized(audit, 'expired')
  if (!r.owner_on_board) unauthorized(audit, 'owner_not_board')

  const scopes: ApiScope[] = r.scopes ?? []
  if (scope && !scopes.includes(scope)) {
    audit.summary.reason = 'missing_scope'
    throw createError({ statusCode: 403, message: `Token lacks scope ${scope}` })
  }

  await sql`UPDATE api_tokens SET last_used_at = NOW() WHERE id = ${r.id}`

  return {
    tokenId: r.id,
    tokenName: r.name,
    ownerPersonId: r.owner_person_id,
    ownerName: r.owner_name,
    scopes,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    lastUsedAt: r.last_used_at,
  }
}

export interface AdminMethod {
  scope: ApiScope | null
  handler: (event: H3Event, caller: ApiCaller, audit: AuditEntry) => unknown | Promise<unknown>
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

/**
 * The only way to write an /api/admin/ route. Route files have no method suffix
 * and list their methods here, so a wrong method is a 405 that is still
 * authenticated and logged, instead of falling through to the page renderer
 * unseen. An empty map is the catch-all: authenticated, logged, 404.
 */
export function defineAdminRoute(methods: Partial<Record<HttpMethod, AdminMethod>>) {
  return defineEventHandler(async (event) => {
    const audit = beginAudit(event)
    try {
      const route = methods[event.method as HttpMethod]
      const caller = await requireApiToken(event, route?.scope ?? null, audit)
      if (!route) {
        const known = Object.keys(methods)
        if (known.length === 0) throw createError({ statusCode: 404, message: 'Not found' })
        setResponseHeader(event, 'Allow', known.join(', '))
        throw createError({ statusCode: 405, message: 'Method not allowed' })
      }
      const result = await route.handler(event, caller, audit)
      audit.status = getResponseStatus(event)
      return result
    } catch (err: any) {
      audit.status = typeof err?.statusCode === 'number' ? err.statusCode : 500
      throw err
    } finally {
      await writeAudit(audit)
    }
  })
}
