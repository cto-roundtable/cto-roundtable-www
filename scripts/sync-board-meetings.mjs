#!/usr/bin/env node
/**
 * Sync styremøte agendas and referater from the ctoroundtable-hq repo into the
 * `board_meetings` table, which is what the board portal reads.
 *
 * The markdown files stay the place the documents are written; this makes them
 * readable for board members who do not use GitHub. Upsert is by slug, so
 * re-running after an edit updates in place and never duplicates.
 *
 *   DATABASE_URL=... node scripts/sync-board-meetings.mjs [path-to-styret/møter]
 *
 * Defaults to ../ctoroundtable-hq/styret/møter relative to this repo.
 *
 * Conventions it relies on (see ctoroundtable-hq/styret/README.md):
 *   - one folder per meeting, named YYYY-MM-DD-styremøte-N
 *   - agenda.md and (once written) referat.md inside it
 *   - the document opens with a single `# ` title line
 *   - a `**Dato:**` line that may carry `kl. HH:MM til HH:MM`
 *   - a `**Sted:**` line
 * Date and meeting number come from the folder name, not the prose, because the
 * folder name is machine-written and the prose is not.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = resolve(HERE, '../../ctoroundtable-hq/styret/møter')

const dir = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_DIR
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}
if (!existsSync(dir)) {
  console.error(`Meeting folder not found: ${dir}`)
  console.error('Pass the path to ctoroundtable-hq/styret/møter as the first argument.')
  process.exit(1)
}

/** URL-safe slug: the folder name with Norwegian letters folded down. */
function toSlug(folder) {
  return folder
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
}

/** Pull the `# ` title off the top and hand back the body without it: the page
 *  renders the title from its own columns, so keeping it would show it twice. */
function splitTitle(md) {
  const lines = md.split(/\r?\n/)
  const i = lines.findIndex((l) => l.trim() !== '')
  if (i === -1) return { title: null, body: md }
  const m = lines[i].match(/^#\s+(.*)$/)
  if (!m) return { title: null, body: md }
  return { title: m[1].trim(), body: lines.slice(i + 1).join('\n').replace(/^\s+/, '') }
}

/** `**Sted:** Café Tekehtopa, ...` -> the value, with any trailing parenthetical
 *  aside left in place: it is usually the useful bit ("styrerommet"). */
function field(md, label) {
  const m = md.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

/** `**Dato:** ..., kl. 18:00 til 20:00` -> ['18:00', '20:00']. */
function times(md) {
  const dato = field(md, 'Dato') ?? ''
  const m = dato.match(/kl\.?\s*(\d{1,2}[:.]\d{2})\s*(?:til|-|–)\s*(\d{1,2}[:.]\d{2})/i)
  if (m) return [m[1].replace('.', ':'), m[2].replace('.', ':')]
  const single = dato.match(/kl\.?\s*(\d{1,2}[:.]\d{2})/i)
  return single ? [single[1].replace('.', ':'), null] : [null, null]
}

/** Oslo is UTC+2 in summer, UTC+1 in winter. Build the instant by formatting a
 *  candidate UTC time in Europe/Oslo and correcting by the difference, which is
 *  exact for every hour that is not inside a DST transition. Board meetings are
 *  in the evening, so they never are. */
function osloInstant(dateStr, hhmm) {
  if (!hhmm) return null
  const [h, min] = hhmm.split(':').map(Number)
  const naive = Date.UTC(
    ...dateStr.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))),
    h,
    min,
  )
  // sv-SE formats as "YYYY-MM-DD HH:mm:ss"; the T makes it an ISO string Date parses.
  const asOslo = new Date(naive).toLocaleString('sv-SE', { timeZone: 'Europe/Oslo' })
  const offset = new Date(`${asOslo.replace(' ', 'T')}Z`).getTime() - naive
  return new Date(naive - offset).toISOString()
}

const sql = neon(databaseUrl)
const folders = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}-/.test(d.name))
  .map((d) => d.name)
  .sort()

if (folders.length === 0) {
  console.error(`No meeting folders (YYYY-MM-DD-...) found in ${dir}`)
  process.exit(1)
}

let synced = 0
for (const folder of folders) {
  const agendaPath = join(dir, folder, 'agenda.md')
  const referatPath = join(dir, folder, 'referat.md')

  const agendaRaw = existsSync(agendaPath) ? readFileSync(agendaPath, 'utf8') : null
  const referatRaw = existsSync(referatPath) ? readFileSync(referatPath, 'utf8') : null

  if (!agendaRaw && !referatRaw) {
    console.warn(`  skip ${folder}: neither agenda.md nor referat.md`)
    continue
  }

  const meetingDate = folder.slice(0, 10)
  const numberMatch = folder.match(/-(\d+)$/)
  const number = numberMatch ? Number(numberMatch[1]) : 0
  const slug = toSlug(folder)

  const agenda = agendaRaw ? splitTitle(agendaRaw) : { title: null, body: null }
  const referat = referatRaw ? splitTitle(referatRaw) : { title: null, body: null }

  const meta = agendaRaw ?? referatRaw
  const [from, to] = times(meta)
  const location = field(meta, 'Sted')
  // A written referat is what makes a meeting past tense. Nothing else in these
  // files reliably says whether it happened.
  const status = referatRaw ? 'held' : 'upcoming'
  const title = agenda.title ?? referat.title ?? `Styremøte nr. ${number}`

  await sql`
    INSERT INTO board_meetings
      (slug, number, meeting_date, starts_at, ends_at, title, location, status,
       agenda_md, minutes_md, source_path, synced_at)
    VALUES
      (${slug}, ${number}, ${meetingDate},
       ${osloInstant(meetingDate, from)}, ${osloInstant(meetingDate, to)},
       ${title}, ${location}, ${status},
       ${agenda.body}, ${referat.body}, ${`styret/møter/${folder}`}, now())
    ON CONFLICT (slug) DO UPDATE SET
      number       = EXCLUDED.number,
      meeting_date = EXCLUDED.meeting_date,
      starts_at    = EXCLUDED.starts_at,
      ends_at      = EXCLUDED.ends_at,
      title        = EXCLUDED.title,
      location     = EXCLUDED.location,
      status       = EXCLUDED.status,
      agenda_md    = EXCLUDED.agenda_md,
      minutes_md   = EXCLUDED.minutes_md,
      source_path  = EXCLUDED.source_path,
      synced_at    = now(),
      updated_at   = now()
  `

  console.log(
    `  ${slug}  ${status.padEnd(8)} agenda:${agendaRaw ? 'ja' : 'nei'} referat:${referatRaw ? 'ja' : 'nei'}`,
  )
  synced++
}

console.log(`\nSynced ${synced} meeting${synced === 1 ? '' : 's'} from ${dir}`)
