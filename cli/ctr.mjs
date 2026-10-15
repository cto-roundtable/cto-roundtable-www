#!/usr/bin/env node
/**
 * ctr: the CTO Roundtable member portal, for agents. Talks to /api/admin/**
 * with a per-agent API token. Zero dependencies (Node 22: fetch, parseArgs).
 *
 *   CTR_API_TOKEN=ctr_... node cli/ctr.mjs whoami
 *
 * See cli/README.md for every command. Every request is checked against the
 * token's scopes and its owner's board membership, and written to the audit log
 * on the server, refusals included.
 */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const DEFAULT_URL = 'https://www.ctoroundtable.no'

const HELP = `ctr: the member portal admin API, for agents

usage: ctr <command> [options]

  whoami                               the token, its owner and scopes
  events ls [--from D] [--to D] [--group slug] [--limit N]
  surveys ls [--status open|closed|draft]
  surveys show <id>
  surveys results <id> [--texts]       --texts adds free-text answers with names
  surveys create <eventId> [--title T] [--intro T] [--closes-at ISO] [--draft]
                           [--questions-file q.json]
  surveys close <id>
  surveys reopen <id>
  surveys sweep [--dry-run] [--window-days N]
                                       open a survey for every recently passed event

  --json      print the API response as JSON (every command)
  -h, --help  this text

env: CTR_API_TOKEN (required), CTR_API_URL (default ${DEFAULT_URL})
exit: 0 ok, 1 the API refused or failed, 2 usage`

const OPTIONS = {
  json: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  from: { type: 'string' },
  to: { type: 'string' },
  group: { type: 'string' },
  limit: { type: 'string' },
  status: { type: 'string' },
  texts: { type: 'boolean', default: false },
  title: { type: 'string' },
  intro: { type: 'string' },
  'closes-at': { type: 'string' },
  draft: { type: 'boolean', default: false },
  'questions-file': { type: 'string' },
  'dry-run': { type: 'boolean', default: false },
  'window-days': { type: 'string' },
}

function usage(msg) {
  if (msg) console.error(`ctr: ${msg}`)
  console.error(HELP)
  process.exit(2)
}

let parsed
try {
  parsed = parseArgs({ allowPositionals: true, options: OPTIONS, strict: true })
} catch (err) {
  usage(err.message)
}
const { values: opt, positionals } = parsed
if (opt.help || positionals.length === 0) {
  console.log(HELP)
  process.exit(positionals.length === 0 && !opt.help ? 2 : 0)
}

const baseUrl = (process.env.CTR_API_URL || DEFAULT_URL).replace(/\/+$/, '')
const token = (process.env.CTR_API_TOKEN || '').trim()

async function api(method, path, { query, body } = {}) {
  if (!token) usage('CTR_API_TOKEN is not set')
  const url = new URL(`/api/admin${path}`, baseUrl)
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== false) url.searchParams.set(k, String(v))
  }
  let res
  try {
    res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    })
  } catch (err) {
    console.error(`ctr: ${method} ${url.pathname} failed: ${err.message}`)
    process.exit(1)
  }
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { message: text.slice(0, 300) }
  }
  if (!res.ok) {
    if (opt.json) console.log(JSON.stringify(data, null, 2))
    const errors = data?.data?.errors ? ` ${JSON.stringify(data.data.errors)}` : ''
    console.error(`ctr: ${res.status} ${data?.message || data?.statusMessage || res.statusText}${errors}`)
    process.exit(1)
  }
  return data
}

/** Print as JSON with --json, otherwise through the human formatter. */
function out(data, human) {
  if (opt.json) console.log(JSON.stringify(data, null, 2))
  else human(data)
}

function table(rows, cols) {
  if (rows.length === 0) return console.log('(none)')
  const cells = rows.map((r) => cols.map((c) => String(c.get(r) ?? '-')))
  const widths = cols.map((c, i) => Math.max(c.head.length, ...cells.map((row) => row[i].length)))
  const line = (vals) =>
    vals
      .map((v, i) => (i === vals.length - 1 ? v : v.padEnd(widths[i])))
      .join('  ')
      .trimEnd()
  console.log(line(cols.map((c) => c.head)))
  for (const row of cells) console.log(line(row))
}

const day = (iso) => (iso ? String(iso).slice(0, 10) : null)

function need(id, what) {
  if (!id) usage(`${what} is required`)
  return id
}

function eventLabel(e) {
  return [e?.date, e?.theme].filter(Boolean).join(' ') || e?.id
}

const commands = {
  async whoami() {
    const d = await api('GET', '/whoami')
    out(d, () => {
      console.log(`token   ${d.token.name} (${d.token.id})`)
      console.log(`owner   ${d.owner.name}`)
      console.log(`scopes  ${d.token.scopes.join(', ')}`)
      console.log(`expires ${day(d.token.expiresAt) ?? 'never'}`)
    })
  },

  async 'events ls'() {
    const d = await api('GET', '/events', { query: { from: opt.from, to: opt.to, group: opt.group, limit: opt.limit } })
    out(d, () =>
      table(d.events, [
        { head: 'DATE', get: (e) => e.date },
        { head: 'GROUP', get: (e) => e.group?.slug },
        { head: 'ID', get: (e) => e.id },
        { head: 'THEME', get: (e) => [e.theme, e.location].filter(Boolean).join(' @ ') },
      ]),
    )
  },

  async 'surveys ls'() {
    const d = await api('GET', '/surveys', { query: { status: opt.status } })
    out(d, () =>
      table(d.surveys, [
        { head: 'STATUS', get: (s) => (s.status === 'open' && !s.isOpen ? 'open (past deadline)' : s.status) },
        { head: 'ANSWERS', get: (s) => s.responseCount },
        { head: 'EVENT', get: (s) => s.event?.date },
        { head: 'ID', get: (s) => s.id },
        { head: 'TITLE', get: (s) => s.title },
      ]),
    )
  },

  async 'surveys show'(id) {
    const d = await api('GET', `/surveys/${encodeURIComponent(need(id, 'survey id'))}`)
    out(d, () => {
      const s = d.survey
      console.log(`${s.title}  [${s.status}${s.status === 'open' && !d.isOpen ? ', past deadline' : ''}]`)
      console.log(`event    ${eventLabel({ id: s.eventId, date: s.eventDate, theme: s.eventTheme })} (${s.eventId})`)
      console.log(`group    ${s.groupSlug ?? '-'}  lang ${s.lang}`)
      console.log(`closes   ${s.closesAt ?? 'no deadline'}`)
      console.log(`answers  ${d.responseCount}`)
      if (s.intro) console.log(`\n${s.intro}`)
      console.log('')
      for (const q of s.questions) {
        const extra = q.type === 'rating' ? ` 1-${q.scale ?? 5}` : q.options ? `: ${q.options.join(' / ')}` : ''
        console.log(`  ${q.id}  ${q.type}${extra}${q.required ? ' (required)' : ''}  ${q.label}`)
      }
    })
  },

  async 'surveys results'(id) {
    const d = await api('GET', `/surveys/${encodeURIComponent(need(id, 'survey id'))}/results`, {
      query: { texts: opt.texts ? '1' : undefined },
    })
    out(d, () => {
      console.log(`${d.title}  [${d.status}]  ${d.responseCount} answers`)
      for (const q of d.questions) {
        console.log(`\n${q.id}  ${q.label}  (${q.answered} answered)`)
        if (q.type === 'rating') {
          console.log(`  average ${q.average ?? '-'} of ${q.scale}`)
          console.log(`  ${q.distribution.map((n, i) => `${i + 1}: ${n}`).join('  ')}`)
        } else if (q.options) {
          for (const o of q.options) console.log(`  ${o.option}: ${o.count}`)
        } else if (q.texts) {
          for (const t of q.texts) console.log(`  ${t.name}: ${t.text.replace(/\s+/g, ' ')}`)
        }
      }
    })
  },

  async 'surveys create'(eventId) {
    const body = { eventId: need(eventId, 'event id'), status: opt.draft ? 'draft' : 'open' }
    if (opt.title !== undefined) body.title = opt.title
    if (opt.intro !== undefined) body.intro = opt.intro
    if (opt['closes-at'] !== undefined) body.closesAt = opt['closes-at']
    if (opt['questions-file']) {
      try {
        body.questions = JSON.parse(readFileSync(opt['questions-file'], 'utf8'))
      } catch (err) {
        usage(`--questions-file: ${err.message}`)
      }
    }
    const d = await api('POST', '/surveys', { body })
    out(d, () => console.log(`created survey ${d.id} (${body.status})`))
  },

  async 'surveys close'(id) {
    const d = await api('PATCH', `/surveys/${encodeURIComponent(need(id, 'survey id'))}`, {
      body: { status: 'closed' },
    })
    out(d, () => console.log(`closed ${id}`))
  },

  async 'surveys reopen'(id) {
    const d = await api('PATCH', `/surveys/${encodeURIComponent(need(id, 'survey id'))}`, { body: { status: 'open' } })
    out(d, () => console.log(`reopened ${id}`))
  },

  async 'surveys sweep'() {
    const d = await api('POST', '/surveys/sweep', {
      query: { dryRun: opt['dry-run'] ? '1' : undefined, windowDays: opt['window-days'] },
    })
    out(d, () => {
      const verb = d.dryRun ? 'would create' : 'created'
      console.log(`${verb} ${d.created.length}, already had a survey ${d.existing}, skipped ${d.skipped.length}`)
      for (const c of d.created) console.log(`  + ${c.date} ${c.group} event ${c.eventId} -> survey ${c.surveyId ?? '-'}`)
      for (const s of d.skipped) console.log(`  - event ${s.eventId}: ${s.reason}`)
    })
  },
}

// Commands that take one id; every other command takes none.
const TAKES_ID = new Set(['surveys show', 'surveys results', 'surveys create', 'surveys close', 'surveys reopen'])

const words = positionals[0] === 'whoami' ? 1 : 2
const name = positionals.slice(0, words).join(' ')
const args = positionals.slice(words)
const run = commands[name]
if (!run) usage(`unknown command: ${positionals.join(' ')}`)
if (args.length > (TAKES_ID.has(name) ? 1 : 0)) usage(`too many arguments for ${name}`)
await run(args[0])
