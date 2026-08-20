#!/usr/bin/env node
/**
 * Render a styreprotokoll PDF from a referat.md, without a database.
 *
 * The portal renders protocols from `board_meetings.minutes_md`, which is the
 * same text this reads off disk. This exists so the layout can be looked at
 * while it is being changed, and so the parser can be pointed at a real referat
 * before anyone issues a protocol from it.
 *
 *   npm run render:protocol -- ../ctoroundtable-hq/styret/møter/2026-08-20-styremøte-2/referat.md
 *
 * Writes protokoll-<slug>.pdf in the current directory unless a second argument
 * gives an output path. PROTOCOL_CHAIR and PROTOCOL_SIGNER name the two
 * signature lines. The hash, version and signers it prints are placeholders: a
 * real protocol gets its identity from the board_protocols row, not from this.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { renderProtocolPdf } from '../server/utils/protocolPdf.ts'

const input = process.argv[2]
if (!input) {
  console.error('Usage: node scripts/render-protocol.mjs <referat.md> [out.pdf]')
  process.exit(1)
}

const path = resolve(input)
if (!existsSync(path)) {
  console.error(`Not found: ${path}`)
  process.exit(1)
}

const raw = readFileSync(path, 'utf8')

// sync-board-meetings.mjs strips the `# ` title before storing, because the page
// renders the title from its own columns. Do the same so this sees exactly what
// the database would hold.
function splitTitle(md) {
  const lines = md.split(/\r?\n/)
  const i = lines.findIndex((l) => l.trim() !== '')
  if (i === -1) return { title: null, body: md }
  const m = lines[i].match(/^#\s+(.*)$/)
  if (!m) return { title: null, body: md }
  return { title: m[1].trim(), body: lines.slice(i + 1).join('\n').replace(/^\s+/, '') }
}

function field(md, label) {
  const m = md.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

const { title, body } = splitTitle(raw)

// Meeting metadata comes from the database in production. Offline it comes from
// the folder name, which is machine-written, and the prose, which is not.
const folder = basename(dirname(path))
const meetingDate = /^\d{4}-\d{2}-\d{2}/.test(folder) ? folder.slice(0, 10) : '1970-01-01'
const number = Number(folder.match(/-(\d+)$/)?.[1] ?? 0)

const dato = field(body, 'Dato') ?? ''
const timeMatch = dato.match(/kl\.?\s*(\d{1,2})[:.](\d{2})(?:\s*(?:til|-|–)\s*(\d{1,2})[:.](\d{2}))?/i)
const at = (h, m) => (h === undefined ? null : new Date(`${meetingDate}T${h.padStart(2, '0')}:${m}:00+02:00`))

const contentSha256 = createHash('sha256').update(body, 'utf8').digest('hex')

const pdf = await renderProtocolPdf({
  meeting: {
    slug: folder,
    number,
    title,
    meetingDate,
    startsAt: timeMatch ? at(timeMatch[1], timeMatch[2]) : null,
    endsAt: timeMatch?.[3] ? at(timeMatch[3], timeMatch[4]) : null,
    location: field(body, 'Sted'),
  },
  minutesMd: body,
  version: 1,
  protocolId: '00000000-0000-0000-0000-000000000000',
  contentSha256,
  chairName: process.env.PROTOCOL_CHAIR ?? 'Snorre Lothar von Gohren Edwin',
  secondSignerName: process.env.PROTOCOL_SIGNER ?? null,
  issuedAt: new Date(`${meetingDate}T12:00:00Z`),
  referatUrl: `https://ctoroundtable.no/member/board/${folder}`,
})

const out = resolve(process.argv[3] ?? `protokoll-${folder}.pdf`)
writeFileSync(out, pdf)
console.log(`${out}`)
console.log(`  ${pdf.length} bytes, innholds-hash sha256 ${contentSha256}`)
console.log('  NB: dokument-ID og versjon er plassholdere, ikke en utstedt protokoll.')
