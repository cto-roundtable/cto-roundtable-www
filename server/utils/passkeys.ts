import { timingSafeEqual } from 'node:crypto'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server'
import type { H3Event } from 'h3'
import type { SessionData } from './session'

// Passkeys (WebAuthn) as an option next to the email magic link. The email is
// still the identity anchor: a passkey can only be registered from inside a
// session, and every passkey sign-in passes the same login gate as the magic
// link (server/utils/membership.ts). Library: SimpleWebAuthn. Table:
// webauthn_credentials (ctoroundtable-hq migration 022).

export const RP_NAME = 'CTO Roundtable'

/**
 * Relying party for this request. Taken from config.siteUrl in production, never
 * from the Host header (same rule as the magic link in /api/auth/request).
 *
 * rpID is the site's hostname without "www.", so a passkey made on
 * www.ctoroundtable.no also works on ctoroundtable.no (both serve the site, and
 * the browser allows an rpID that is a registrable suffix of the origin). The
 * accepted origins are siteUrl and its www/apex twin, both derived from config.
 * Locally siteUrl is empty and we fall back to the request origin (localhost).
 */
export function relyingParty(event: H3Event): { rpID: string; origins: string[] } {
  const config = useRuntimeConfig()
  const url = new URL(config.siteUrl || getRequestURL(event).origin)
  const rpID = url.hostname.replace(/^www\./, '')
  const origins = [url.origin]
  if (url.hostname !== 'localhost' && !/^[\d.]+$/.test(url.hostname)) {
    const twin = url.hostname.startsWith('www.') ? rpID : `www.${rpID}`
    origins.push(`${url.protocol}//${twin}${url.port ? `:${url.port}` : ''}`)
  }
  return { rpID, origins }
}

// --- Challenge cookie --------------------------------------------------------
// Not a table: a 5 minute httpOnly, secure, sameSite=strict cookie holding
// {challenge, purpose, exp, personId?} and an HMAC over it with sessionSecret.
// `purpose` stops a registration challenge from being spent on a sign-in and
// vice versa; `personId` binds a registration to the session that asked for it.
// The cookie is deleted as soon as it is read, so each challenge is one-shot.

const CHALLENGE_COOKIE = 'ctr_webauthn'
const CHALLENGE_TTL = 5 * 60 // seconds
const CHALLENGE_PATH = '/api/auth/passkey'

type ChallengePurpose = 'register' | 'login'

interface ChallengePayload {
  challenge: string
  purpose: ChallengePurpose
  exp: number
  personId?: string
}

export function setPasskeyChallenge(
  event: H3Event,
  challenge: string,
  purpose: ChallengePurpose,
  personId?: string,
): void {
  const config = useRuntimeConfig()
  const payload: ChallengePayload = { challenge, purpose, exp: Date.now() + CHALLENGE_TTL * 1000, personId }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  setCookie(event, CHALLENGE_COOKIE, `${body}.${createSessionHmac(body, config.sessionSecret)}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: CHALLENGE_PATH,
    maxAge: CHALLENGE_TTL,
  })
}

/** Read and delete the challenge cookie. Null unless signed, unexpired and for this purpose. */
export function takePasskeyChallenge(event: H3Event, purpose: ChallengePurpose): ChallengePayload | null {
  const config = useRuntimeConfig()
  const raw = getCookie(event, CHALLENGE_COOKIE)
  deleteCookie(event, CHALLENGE_COOKIE, { path: CHALLENGE_PATH })
  if (!raw) return null

  const [body, sig] = raw.split('.')
  if (!body || !sig) return null
  const expected = createSessionHmac(body, config.sessionSecret)
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null

  try {
    const data: ChallengePayload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (data.purpose !== purpose || data.exp < Date.now() || typeof data.challenge !== 'string') return null
    return data
  } catch {
    return null
  }
}

// --- Guards -------------------------------------------------------------------

/**
 * The passkey routes live under /api/auth/, where the /api/member/ middleware
 * does not run, so they check the session and the login gate themselves.
 */
export async function requirePortalSession(event: H3Event): Promise<SessionData> {
  const session = verifySession(event)
  if (!session || !(await isPortalMember(session.personId))) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  return session
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Route param as a uuid, or a 404 (an invalid uuid would otherwise be a 500 from Postgres). */
export function credentialIdParam(event: H3Event): string {
  const id = getRouterParam(event, 'id') || ''
  if (!UUID_RE.test(id)) throw createError({ statusCode: 404, message: 'Not found' })
  return id
}

/** A member-chosen label: trimmed, at most 60 characters, null when empty. */
export function cleanPasskeyName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, 60)
  return trimmed || null
}

// --- Storage --------------------------------------------------------------------

export interface StoredCredential {
  id: string
  personId: string
  credentialId: string
  publicKey: Uint8Array<ArrayBuffer>
  counter: number
  transports: AuthenticatorTransportFuture[]
}

export interface PasskeySummary {
  id: string
  name: string | null
  createdAt: string
  lastUsedAt: string | null
  deviceType: string | null
  backedUp: boolean | null
}

/** The member's own passkeys, newest first. */
export async function listPasskeys(personId: string): Promise<PasskeySummary[]> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT id, name, created_at, last_used_at, device_type, backed_up
    FROM webauthn_credentials
    WHERE person_id = ${personId}
    ORDER BY created_at DESC
  `
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: new Date(r.created_at).toISOString(),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    deviceType: r.device_type,
    backedUp: r.backed_up,
  }))
}

/** Credential ids (base64url) + transports the member already has, for excludeCredentials. */
export async function listCredentialDescriptors(
  personId: string,
): Promise<{ id: string; transports?: AuthenticatorTransportFuture[] }[]> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT credential_id, transports FROM webauthn_credentials WHERE person_id = ${personId}
  `
  return rows.map((r) => ({ id: r.credential_id, transports: r.transports ?? undefined }))
}

export async function findCredential(credentialId: string): Promise<StoredCredential | null> {
  const sql = useDatabase()
  // The key goes over the wire as hex text so the driver's bytea parsing
  // does not matter.
  const rows = await sql`
    SELECT id, person_id, credential_id, encode(public_key, 'hex') AS public_key, counter, transports
    FROM webauthn_credentials
    WHERE credential_id = ${credentialId}
  `
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    personId: r.person_id,
    credentialId: r.credential_id,
    publicKey: new Uint8Array(Buffer.from(r.public_key, 'hex')),
    counter: Number(r.counter),
    transports: r.transports ?? [],
  }
}

export async function insertCredential(input: {
  personId: string
  credentialId: string
  publicKey: Uint8Array
  counter: number
  transports: string[]
  deviceType: string
  backedUp: boolean
  name: string | null
}): Promise<string | null> {
  const sql = useDatabase()
  const rows = await sql`
    INSERT INTO webauthn_credentials
      (person_id, credential_id, public_key, counter, transports, device_type, backed_up, name)
    VALUES (
      ${input.personId}, ${input.credentialId}, decode(${Buffer.from(input.publicKey).toString('hex')}, 'hex'),
      ${input.counter}, ${input.transports}, ${input.deviceType}, ${input.backedUp}, ${input.name}
    )
    ON CONFLICT (credential_id) DO NOTHING
    RETURNING id
  `
  return rows[0]?.id ?? null
}

/**
 * Record a successful sign-in. The counter only moves forward: the WHERE makes a
 * concurrent replay of the same assertion lose (0 rows), except for authenticators
 * that always report 0 (synced passkeys), which have no counter to compare.
 */
export async function recordPasskeyUse(
  id: string,
  newCounter: number,
  deviceType: string,
  backedUp: boolean,
): Promise<boolean> {
  const sql = useDatabase()
  const rows = await sql`
    UPDATE webauthn_credentials
    SET counter = ${newCounter}, device_type = ${deviceType}, backed_up = ${backedUp}, last_used_at = now()
    WHERE id = ${id} AND (counter < ${newCounter} OR (counter = 0 AND ${newCounter} = 0))
    RETURNING id
  `
  return rows.length > 0
}

/** Rename one of the member's OWN passkeys. False when it is not theirs (or does not exist). */
export async function renamePasskey(personId: string, id: string, name: string | null): Promise<boolean> {
  const sql = useDatabase()
  const rows = await sql`
    UPDATE webauthn_credentials SET name = ${name}
    WHERE id = ${id} AND person_id = ${personId}
    RETURNING id
  `
  return rows.length > 0
}

/** Delete one of the member's OWN passkeys. False when it is not theirs (or does not exist). */
export async function deletePasskey(personId: string, id: string): Promise<boolean> {
  const sql = useDatabase()
  const rows = await sql`
    DELETE FROM webauthn_credentials
    WHERE id = ${id} AND person_id = ${personId}
    RETURNING id
  `
  return rows.length > 0
}
