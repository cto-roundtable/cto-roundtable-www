import { createHash, randomBytes, randomInt } from 'node:crypto'
import type { H3Event } from 'h3'
import type { AuditEntry } from './audit'

/**
 * Device-flow sign-in for agents (`ctr login`), the RFC 8628 shape from
 * decision device-flow-rust.md. Table device_authorizations
 * (ctoroundtable-hq/infrastructure/db/migrations/029_device_authorizations.sql).
 *
 *   POST /api/auth/device/code     the agent asks for a code pair (no auth)
 *   GET  /api/auth/device/lookup   the approve page shows what is asking (styret)
 *   POST /api/auth/device/approve  styret, signed in within REAUTH_WINDOW_MS
 *   POST /api/auth/device/deny     styret
 *   POST /api/auth/device/token    the agent polls; the token comes out once
 *
 * The api_tokens row is created when the approved code is picked up, owned by
 * the approver, so the plaintext token only ever exists in that one response
 * and the per-request gate in apiTokens.ts (active, in styret, scope) applies
 * unchanged. Every step writes one api_audit_log row, refusals included. Never
 * the device_code, the user_code or the token.
 */

/** How long a code pair lives, and how often the agent may poll (RFC 8628 3.2). */
export const DEVICE_CODE_TTL_S = 600
export const POLL_INTERVAL_S = 5
/** At most this many live pending codes per requesting IP. */
export const MAX_PENDING_PER_IP = 5
/** A token issued by the device flow lives this long. */
export const DEVICE_TOKEN_TTL_DAYS = 90

/** 20 consonants: no vowels (no words), no lookalikes (RFC 8628 6.1). */
const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'
const DEVICE_CODE_RE = /^[A-Za-z0-9_-]{43}$/

export function newDeviceCode(): { deviceCode: string; hash: string } {
  const deviceCode = randomBytes(32).toString('base64url')
  return { deviceCode, hash: hashDeviceCode(deviceCode) }
}

export function hashDeviceCode(deviceCode: string): string {
  return createHash('sha256').update(deviceCode).digest('hex')
}

export function isDeviceCode(input: unknown): input is string {
  return typeof input === 'string' && DEVICE_CODE_RE.test(input)
}

/** ABCD-EFGH, 20^8 combinations. */
export function newUserCode(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

/** What a person typed (any case, spaces, dash or not) as ABCD-EFGH, or null. */
export function normalizeUserCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const s = input.toUpperCase().replace(/[^A-Z]/g, '')
  if (s.length !== 8 || [...s].some((c) => !USER_CODE_ALPHABET.includes(c))) return null
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

/** Cloud Run puts the client first in X-Forwarded-For. */
export function requestIp(event: H3Event): string | null {
  return getRequestIP(event, { xForwardedFor: true })?.slice(0, 64) ?? null
}

/** <siteUrl>/member/device. Like passkeys, never from the Host header in production. */
export function verificationUri(event: H3Event): string {
  const config = useRuntimeConfig()
  if (!config.siteUrl && process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 500, message: 'Device flow needs NUXT_SITE_URL' })
  }
  return `${new URL(config.siteUrl || getRequestURL(event).origin).origin}/member/device`
}

/**
 * An OAuth-style error body ({ error }), which is what RFC 8628 clients read,
 * with the result recorded in the audit row.
 */
export function deviceError(
  event: H3Event,
  audit: AuditEntry,
  statusCode: number,
  error: string,
  description?: string,
): { error: string; error_description?: string } {
  setResponseStatus(event, statusCode)
  audit.summary.result = error
  return description ? { error, error_description: description } : { error }
}

/**
 * The approver for the member-facing steps: a portal session (401 otherwise)
 * whose holder is in styret (403). With `recent`, the session must also be
 * from the last REAUTH_WINDOW_MS (the passkeys rule): a stolen 30-day cookie
 * must not be able to mint a 90-day token. Returns null and sets 403
 * { code: 'reauth' } when only the sign-in is too old.
 */
export async function requireApprover(
  event: H3Event,
  audit: AuditEntry,
  recent: boolean,
): Promise<{ personId: string; recent: boolean } | null> {
  let session: Awaited<ReturnType<typeof requirePortalSession>>
  try {
    session = await requirePortalSession(event)
  } catch (err) {
    audit.summary.reason = 'no_session'
    throw err
  }
  audit.ownerPersonId = session.personId
  if (!(await isBoardMember(session.personId))) {
    audit.summary.reason = 'not_board'
    throw createError({ statusCode: 403, message: 'Board only' })
  }
  const isRecent = isRecentSession(session)
  if (recent && !isRecent) {
    audit.summary.reason = 'reauth'
    setResponseStatus(event, 403)
    return null
  }
  return { personId: session.personId, recent: isRecent }
}

export interface DeviceRequestRow {
  id: string
  client_name: string
  scopes: string[]
  requested_ip: string | null
  status: 'pending' | 'approved' | 'denied' | 'consumed' | 'expired'
  created_at: string
  expires_at: string
}

/** The row behind a user_code, with a pending/approved row past expires_at reported as expired. */
export async function findDeviceRequest(userCode: string): Promise<DeviceRequestRow | null> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT id, client_name, scopes, requested_ip, created_at, expires_at,
           CASE WHEN status IN ('pending', 'approved') AND expires_at <= NOW() THEN 'expired' ELSE status END AS status
    FROM device_authorizations
    WHERE user_code = ${userCode}
    LIMIT 1
  `
  return (rows[0] as DeviceRequestRow | undefined) ?? null
}

/** Why approve/deny changed nothing: 404 unknown, 410 expired, 409 already decided. */
export async function refuseDecision(
  event: H3Event,
  audit: AuditEntry,
  userCode: string,
): Promise<{ code: string; status?: string }> {
  const request = await findDeviceRequest(userCode)
  if (!request) {
    audit.summary.result = 'not_found'
    throw createError({ statusCode: 404, message: 'No such code' })
  }
  audit.targetId = request.id
  audit.summary.result = request.status
  if (request.status === 'expired') {
    setResponseStatus(event, 410)
    return { code: 'expired' }
  }
  setResponseStatus(event, 409)
  return { code: 'decided', status: request.status }
}

/**
 * The only way to write an /api/auth/device/ route: one api_audit_log row per
 * request with the final status, like defineAdminRoute.
 */
export function defineDeviceRoute(handler: (event: H3Event, audit: AuditEntry) => unknown | Promise<unknown>) {
  return defineEventHandler(async (event) => {
    const audit = beginAudit(event)
    audit.targetType = 'device_authorization'
    try {
      const result = await handler(event, audit)
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
