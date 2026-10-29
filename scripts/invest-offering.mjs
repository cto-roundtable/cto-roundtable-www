#!/usr/bin/env node
/**
 * Look after a CTORI offering in the portal (invest_offerings, hq migrations 031 + 041)
 * from a box, until the board view (signup step 4) can do it in the browser.
 *
 *   DATABASE_URL=... node scripts/invest-offering.mjs show ctori-4
 *   DATABASE_URL=... node scripts/invest-offering.mjs publish ctori-4 deck ./ctori4-deck.html \
 *     --title "CTO Roundtable Invest 4" [--note "after the committee"] [--by c3440] [--dry-run]
 *   DATABASE_URL=... node scripts/invest-offering.mjs status ctori-4 interest [--confirm]
 *
 * `show`    the offering, its amount rule, its documents (current versions) and the
 *           interest counts. Names no member.
 * `publish` a new version of a document. The same bytes as the current version write
 *           nothing. Versions are never edited (a subscriber attests to a sha256).
 *           HTML, PDF and Markdown only, at most 5 MB.
 * `status`  draft -> interest -> committing -> closed. Opening the interest phase is the
 *           launch: every portal member sees the page and the banner from then on. So
 *           without --confirm it only says what would change.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { parseArgs } from 'node:util'
import { neon } from '@neondatabase/serverless'

const STATUSES = ['draft', 'interest', 'committing', 'closed']
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8' }
const MAX_BYTES = 5 * 1024 * 1024

const log = (...a) => console.error(...a)
function fail(msg) {
  log(`FAIL  ${msg}`)
  process.exit(1)
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: 'string' },
    note: { type: 'string' },
    by: { type: 'string' },
    confirm: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
})

const [command, slug, ...rest] = positionals
if (values.help || !command || !slug) {
  log('Usage: invest-offering.mjs show <slug> | publish <slug> <key> <file> --title "..." | status <slug> <status> [--confirm]')
  process.exit(values.help ? 0 : 1)
}
if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set')
const sql = neon(process.env.DATABASE_URL)

const [offering] = await sql`SELECT * FROM invest_offerings WHERE slug = ${slug}`
if (!offering) fail(`no offering "${slug}"`)

if (command === 'show') {
  const docs = await sql`
    SELECT DISTINCT ON (key) key, title, version, sha256, octet_length(body) AS bytes, created_at
    FROM invest_offering_documents WHERE offering_id = ${offering.id} ORDER BY key, version DESC`
  const [counts] = await sql`
    SELECT count(*) FILTER (WHERE phase = 'interest' AND interest_level = 'yes')   AS yes,
           count(*) FILTER (WHERE phase = 'interest' AND interest_level = 'maybe') AS maybe,
           count(*) FILTER (WHERE phase = 'declined') AS declined,
           coalesce(sum(amount_nok) FILTER (WHERE phase = 'interest' AND interest_level = 'yes'), 0) AS yes_nok
    FROM invest_subscriptions WHERE offering_id = ${offering.id}`
  log(`${offering.slug}  ${offering.name}  status=${offering.status}`)
  log(`  amounts   options ${JSON.stringify((offering.amount_options ?? []).map(Number))}, other: ${
    offering.amount_step ? `>= ${offering.amount_min} in steps of ${offering.amount_step}` : 'not allowed'}`)
  log(`  minimum   ${offering.min_nok ?? '-'} NOK`)
  for (const d of docs) log(`  document  ${d.key} v${d.version} "${d.title}" ${d.bytes} bytes sha256 ${d.sha256.slice(0, 12)} (${d.created_at.toISOString?.() ?? d.created_at})`)
  if (!docs.length) log('  document  none')
  log(`  interest  yes ${counts.yes} (${counts.yes_nok} NOK), maybe ${counts.maybe}, declined ${counts.declined}`)
} else if (command === 'publish') {
  const [key, file] = rest
  if (!key || !file) fail('publish needs <key> <file>')
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(key)) fail(`key "${key}" must be lowercase letters, digits and dashes`)
  if (!values.title) fail('publish needs --title')
  const contentType = CONTENT_TYPES[extname(file).toLowerCase()]
  if (!contentType) fail(`only ${Object.keys(CONTENT_TYPES).join(', ')} files`)
  const bytes = readFileSync(file)
  if (bytes.length > MAX_BYTES) fail(`${bytes.length} bytes is over the 5 MB cap`)
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  const [current] = await sql`
    SELECT version, sha256 FROM invest_offering_documents
    WHERE offering_id = ${offering.id} AND key = ${key} ORDER BY version DESC LIMIT 1`
  if (current?.sha256 === sha256) {
    log(`ok    ${slug}/${key} v${current.version} already has these bytes (sha256 ${sha256.slice(0, 12)}); nothing written`)
    process.exit(0)
  }
  const version = (current?.version ?? 0) + 1
  if (values['dry-run']) {
    log(`would publish ${slug}/${key} v${version}, ${bytes.length} bytes, sha256 ${sha256.slice(0, 12)}`)
    process.exit(0)
  }
  await sql`
    INSERT INTO invest_offering_documents
      (offering_id, key, version, title, content_type, body, sha256, note, published_by)
    VALUES (${offering.id}, ${key}, ${version}, ${values.title}, ${contentType},
            decode(${bytes.toString('hex')}, 'hex'), ${sha256}, ${values.note ?? null}, ${values.by ?? null})`
  log(`ok    published ${slug}/${key} v${version}, ${bytes.length} bytes, sha256 ${sha256.slice(0, 12)}`)
} else if (command === 'status') {
  const [next] = rest
  if (!STATUSES.includes(next)) fail(`status must be one of ${STATUSES.join(', ')}`)
  if (next === offering.status) {
    log(`ok    ${slug} is already ${next}; nothing written`)
    process.exit(0)
  }
  log(`${slug}: ${offering.status} -> ${next}`)
  if (next === 'interest') log('  every portal member (Norway and Sweden) sees the interest page and the banner from now on')
  if (!values.confirm) {
    log('  nothing written. Run again with --confirm to do it.')
    process.exit(0)
  }
  await sql`UPDATE invest_offerings SET status = ${next} WHERE id = ${offering.id}`
  log(`ok    ${slug} is now ${next}`)
} else {
  fail(`unknown command "${command}"`)
}
