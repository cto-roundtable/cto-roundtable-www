#!/usr/bin/env node
/**
 * BREAK-GLASS: mint, list and revoke API tokens for /api/admin/** (the `ctr` CLI).
 * The normal way an agent gets a token is `ctr login` (the device flow, approved
 * by styret at /member/device). Use this only when that is unavailable, and to revoke.
 *
 *
 *   DATABASE_URL=... node scripts/mint-api-token.mjs mint \
 *     --name cto-roundtable-box --owner <email|person uuid> \
 *     --scopes events:read,events:write,surveys:read,surveys:write [--expires-days 365] [--dry-run]
 *   DATABASE_URL=... node scripts/mint-api-token.mjs list
 *   DATABASE_URL=... node scripts/mint-api-token.mjs revoke <token id>
 *
 * `mint` prints the token ONCE, alone on stdout, so it can go straight into a
 * secret store (TOKEN=$(node scripts/mint-api-token.mjs mint ...)). Everything
 * else goes to stderr. Only the sha256 is stored; a lost token is revoked and a
 * new one minted, never recovered.
 *
 * The owner is the person who answers for what the agent does. They must be an
 * active member of `styret` now, and stay one: the portal checks that on every
 * request, so leaving the board disables the token without a revoke.
 *
 * Tokens are revoked, never deleted: api_audit_log names them. See
 * ctoroundtable-hq/infrastructure/db/migrations/026_api_tokens_and_audit.sql.
 */
import { createHash, randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { neon } from '@neondatabase/serverless'

// Keep in step with API_SCOPES in server/utils/apiTokens.ts (and the CHECK on api_tokens.scopes).
const SCOPES = [
  'events:read',
  'events:write',
  'surveys:read',
  'surveys:write',
  'deals:read',
  'deals:write',
  'rounds:write',
  'comments:read',
  'digests:write',
  'qa:read',
  'qa:write',
]
const BOARD_GROUP = 'styret'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const log = (...a) => console.error(...a)
function fail(msg) {
  log(`FAIL  ${msg}`)
  process.exit(1)
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: 'string' },
    owner: { type: 'string' },
    scopes: { type: 'string' },
    'expires-days': { type: 'string', default: '365' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
})
const [command, arg] = positionals

if (values.help || !command) {
  log('usage: mint-api-token.mjs mint --name <agent> --owner <email|uuid> --scopes a,b [--expires-days N] [--dry-run]')
  log('       mint-api-token.mjs list')
  log('       mint-api-token.mjs revoke <token id>')
  log(`scopes: ${SCOPES.join(', ')}`)
  process.exit(command ? 0 : 1)
}

if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set.')
const sql = neon(process.env.DATABASE_URL)

async function findOwner(ref) {
  const rows = UUID_RE.test(ref)
    ? await sql`SELECT id, name, status FROM persons WHERE id = ${ref}`
    : await sql`
        SELECT DISTINCT p.id, p.name, p.status
        FROM contact_infos ci JOIN persons p ON p.id = ci.person_id
        WHERE ci.type = 'email' AND LOWER(ci.value) = ${ref.trim().toLowerCase()}
      `
  if (rows.length === 0) fail(`no person matches --owner ${ref}`)
  if (rows.length > 1) fail(`--owner ${ref} matches ${rows.length} people; pass the person uuid instead`)
  const p = rows[0]
  const board = await sql`
    SELECT 1 FROM memberships m JOIN network_groups ng ON ng.id = m.group_id
    WHERE m.person_id = ${p.id} AND ng.slug = ${BOARD_GROUP} LIMIT 1
  `
  if (p.status !== 'active' || board.length === 0) {
    fail(`${p.name} is not an active member of ${BOARD_GROUP}; only the board can own an API token`)
  }
  return p
}

async function mint() {
  const name = values.name?.trim()
  if (!name) fail('--name is required (which agent holds it, e.g. cto-roundtable-box)')
  if (!values.owner) fail('--owner is required (email or person uuid of the board member who answers for it)')
  const scopes = (values.scopes ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (scopes.length === 0) fail(`--scopes is required, comma separated from: ${SCOPES.join(', ')}`)
  const unknown = scopes.filter((s) => !SCOPES.includes(s))
  if (unknown.length) fail(`unknown scope ${unknown.join(', ')}; allowed: ${SCOPES.join(', ')}`)
  const days = Number(values['expires-days'])
  if (!Number.isInteger(days) || days < 1 || days > 730) fail('--expires-days must be 1 to 730')

  const owner = await findOwner(values.owner)
  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString()
  log(`  ok    owner ${owner.name} (${owner.id}) is an active ${BOARD_GROUP} member`)
  log(`  ok    name ${name}, scopes ${scopes.join(', ')}, expires ${expiresAt.slice(0, 10)}`)
  if (values['dry-run']) {
    log('  would mint and store the sha256 of a new token. Nothing written (--dry-run).')
    return
  }

  const token = `ctr_${randomBytes(32).toString('base64url')}`
  const hash = createHash('sha256').update(token).digest('hex')
  const rows = await sql`
    INSERT INTO api_tokens (name, owner_person_id, token_hash, scopes, expires_at)
    VALUES (${name}, ${owner.id}, ${hash}, ${scopes}, ${expiresAt})
    RETURNING id
  `
  log(`  ok    minted token ${rows[0].id}. The token is below, shown once; store it now (e.g. fnox as CTR_API_TOKEN).`)
  console.log(token)
}

async function list() {
  const rows = await sql`
    SELECT t.id, t.name, p.name AS owner, t.scopes, t.created_at, t.last_used_at, t.expires_at, t.revoked_at
    FROM api_tokens t JOIN persons p ON p.id = t.owner_person_id
    ORDER BY t.created_at DESC
  `
  const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '-')
  for (const r of rows) {
    const state = r.revoked_at ? 'revoked' : r.expires_at && new Date(r.expires_at) < new Date() ? 'expired' : 'active'
    console.log(
      [r.id, state, r.name, r.owner, r.scopes.join(','), `created ${day(r.created_at)}`, `used ${day(r.last_used_at)}`, `expires ${day(r.expires_at)}`].join('  '),
    )
  }
  if (rows.length === 0) log('no tokens')
}

async function revoke() {
  if (!arg || !UUID_RE.test(arg)) fail('revoke needs the token id (a uuid; see `list`)')
  const rows = await sql`
    UPDATE api_tokens SET revoked_at = NOW()
    WHERE id = ${arg} AND revoked_at IS NULL
    RETURNING name
  `
  if (rows.length === 0) fail(`no active token ${arg} (unknown, or already revoked)`)
  log(`  ok    revoked ${arg} (${rows[0].name}). It is refused from the next request on.`)
}

const commands = { mint, list, revoke }
if (!commands[command]) fail(`unknown command ${command}; use mint, list or revoke`)
await commands[command]()
