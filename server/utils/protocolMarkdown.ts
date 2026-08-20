/**
 * Markdown -> blocks, for the styreprotokoll PDF.
 *
 * This is deliberately NOT the renderer in app/utils/markdown.ts. That one
 * escapes to HTML for the browser; this one produces a block tree a PDF
 * renderer can lay out, and it has a job the HTML renderer does not: it decides
 * which parts of a referat become the signed protocol, and it refuses to render
 * characters the PDF font cannot represent.
 *
 * The protocol is the formal record (styremøte 2, vedtak 4): who was present,
 * whether the meeting was vedtaksført, what was decided, what follows from it.
 * The narrative referat stays in the portal.
 */

export type Run = { text: string; bold?: boolean; italic?: boolean; code?: boolean }

export type Block =
  | { type: 'heading'; level: number; runs: Run[] }
  | { type: 'paragraph'; runs: Run[] }
  | { type: 'list'; ordered: boolean; items: Run[][] }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'table'; header: Run[][]; rows: Run[][][] }
  | { type: 'rule' }

export interface Section {
  /** The `## ` heading, verbatim. */
  title: string
  /** Body of the section, markdown, without its heading line. */
  body: string
}

export interface Referat {
  /** Everything above the first `## `: the `**Dato:**` / `**Sted:**` fields. */
  preamble: string
  sections: Section[]
}

// -----------------------------------------------------------------------------
// Character coverage
//
// The PDF uses the PDF Base-14 fonts (see protocolPdf.ts for why), which are
// encoded WinAnsi. A character outside WinAnsi does not fail loudly in pdfkit —
// it is silently emitted as the two bytes of its code point, so `→` prints as
// `!’`. In a document the board signs, silent corruption is the worst possible
// outcome, so anything unrepresentable is either mapped to an explicit ASCII
// equivalent here, or it throws and the author fixes the source.
// -----------------------------------------------------------------------------

/** Characters we accept and rewrite, because the rewrite does not change meaning. */
const SUBSTITUTIONS: Record<string, string> = {
  ' ': ' ', // non-breaking space
  ' ': ' ',
  ' ': ' ',
  ' ': ' ', // thin space
  '‐': '-', // hyphen
  '‑': '-', // non-breaking hyphen
  '−': '-', // minus sign
  '→': '->',
  '←': '<-',
  '⇒': '=>',
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '✓': '[x]', // check mark
  '✔': '[x]',
  '✗': '[ ]',
  '✘': '[ ]',
  '☐': '[ ]',
  '☑': '[x]',
  '­': '', // soft hyphen
  '﻿': '',
}

/** WinAnsi's non-Latin-1 slots (0x80-0x9f), which the Base-14 fonts do carry. */
const WINANSI_EXTRA = new Set([
  '€',
  '‚',
  'ƒ',
  '„',
  '…',
  '†',
  '‡',
  'ˆ',
  '‰',
  'Š',
  '‹',
  'Œ',
  'Ž',
  '‘',
  '’',
  '“',
  '”',
  '•',
  '–',
  '—',
  '˜',
  '™',
  'š',
  '›',
  'œ',
  'ž',
  'Ÿ',
])

function representable(ch: string): boolean {
  const cp = ch.codePointAt(0)!
  if (cp === 0x0a || cp === 0x09) return true
  if (cp >= 0x20 && cp <= 0x7e) return true // ASCII
  if (cp >= 0xa0 && cp <= 0xff) return true // Latin-1, which is where æøåÆØÅ § « » live
  return WINANSI_EXTRA.has(ch)
}

export class UnrepresentableCharacterError extends Error {
  readonly characters: string[]
  constructor(characters: string[]) {
    const list = characters
      .map((c) => `${c} (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`)
      .join(', ')
    super(
      `Protokollen inneholder tegn som ikke kan settes i PDF-fonten: ${list}. ` +
        'Fjern eller erstatt dem i referatet og synk på nytt.',
    )
    this.name = 'UnrepresentableCharacterError'
    this.characters = characters
  }
}

/**
 * Apply the substitution table and then verify what is left. Throws
 * UnrepresentableCharacterError rather than letting a mangled glyph reach a
 * document someone signs.
 */
export function toPdfText(input: string): string {
  let out = ''
  const unmapped = new Set<string>()
  for (const ch of input) {
    const sub = SUBSTITUTIONS[ch]
    if (sub !== undefined) {
      out += sub
      continue
    }
    if (representable(ch)) {
      out += ch
      continue
    }
    unmapped.add(ch)
  }
  if (unmapped.size > 0) throw new UnrepresentableCharacterError([...unmapped])
  return out
}

// -----------------------------------------------------------------------------
// Inline parsing
// -----------------------------------------------------------------------------

/**
 * `**bold**`, `*italic*`, `` `code` `` and links. Links print as their text; a
 * link whose text is not the URL keeps the URL in parentheses, because a printed
 * protocol cannot be clicked and a reference that only exists as a hyperlink is
 * lost.
 */
export function parseInline(text: string): Run[] {
  const flat = text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, url: string) =>
      label.trim() === url ? url : `${label} (${url})`,
    )
    .replace(/<(https?:\/\/[^\s>]+)>/g, '$1')

  const runs: Run[] = []
  // Bold is matched before italic so `**x**` never decomposes into two italics.
  const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|`([^`]+)`/g
  let last = 0
  for (const m of flat.matchAll(re)) {
    const index = m.index ?? 0
    if (index > last) runs.push({ text: flat.slice(last, index) })
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true })
    else if (m[2] !== undefined) runs.push({ text: m[2], italic: true })
    else if (m[3] !== undefined) runs.push({ text: m[3], italic: true })
    else runs.push({ text: m[4]!, code: true })
    last = index + m[0].length
  }
  if (last < flat.length) runs.push({ text: flat.slice(last) })
  return runs.filter((r) => r.text !== '')
}

// -----------------------------------------------------------------------------
// Block parsing
// -----------------------------------------------------------------------------

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())
}

const TABLE_DIVIDER = /^\s*\|?[\s:|-]+\|[\s:|-]*$/

/** Block-level markdown: headings, lists, tables, quotes, rules, paragraphs. */
export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: Block[] = []
  let i = 0

  const flushParagraph = (buffer: string[]) => {
    if (buffer.length === 0) return
    blocks.push({ type: 'paragraph', runs: parseInline(buffer.join(' ').trim()) })
    buffer.length = 0
  }

  const paragraph: string[] = []

  while (i < lines.length) {
    const line = lines[i]!
    const trimmed = line.trim()

    if (trimmed === '') {
      flushParagraph(paragraph)
      i++
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushParagraph(paragraph)
      blocks.push({ type: 'heading', level: heading[1]!.length, runs: parseInline(heading[2]!.trim()) })
      i++
      continue
    }

    if (/^([-*_])\1{2,}$/.test(trimmed.replace(/\s/g, ''))) {
      flushParagraph(paragraph)
      blocks.push({ type: 'rule' })
      i++
      continue
    }

    // Table: a pipe row followed by a divider row.
    if (trimmed.startsWith('|') && lines[i + 1] && TABLE_DIVIDER.test(lines[i + 1]!)) {
      flushParagraph(paragraph)
      const header = splitTableRow(trimmed).map(parseInline)
      i += 2
      const rows: Run[][][] = []
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        rows.push(splitTableRow(lines[i]!.trim()).map(parseInline))
        i++
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    if (trimmed.startsWith('>')) {
      flushParagraph(paragraph)
      const quoted: string[] = []
      while (i < lines.length && lines[i]!.trim().startsWith('>')) {
        quoted.push(lines[i]!.trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(quoted.join('\n')) })
      continue
    }

    const bullet = trimmed.match(/^[-*]\s+(.*)$/)
    const numbered = trimmed.match(/^(\d+)[.)]\s+(.*)$/)
    if (bullet || numbered) {
      flushParagraph(paragraph)
      const ordered = numbered !== null
      const items: Run[][] = []
      // Continuation lines (indented, or simply the wrapped remainder of an item)
      // fold into the current item. The vedtak in a referat are numbered items
      // several sentences long, so this matters.
      let current: string[] = []
      const push = () => {
        if (current.length > 0) items.push(parseInline(current.join(' ').trim()))
        current = []
      }
      while (i < lines.length) {
        const l = lines[i]!
        const t = l.trim()
        if (t === '') {
          // A blank line ends the list unless the next line continues it indented.
          const next = lines[i + 1]
          if (!next || !/^\s{2,}\S/.test(next)) break
          i++
          continue
        }
        const b = t.match(/^[-*]\s+(.*)$/)
        const n = t.match(/^(\d+)[.)]\s+(.*)$/)
        if ((ordered && n) || (!ordered && b)) {
          push()
          current.push((ordered ? n![2]! : b![1]!).trim())
          i++
          continue
        }
        if ((ordered && b) || (!ordered && n)) break // the other kind of list starts
        if (/^#{1,6}\s/.test(t) || t.startsWith('>') || t.startsWith('|')) break
        current.push(t)
        i++
      }
      push()
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    paragraph.push(trimmed)
    i++
  }

  flushParagraph(paragraph)
  return blocks
}

// -----------------------------------------------------------------------------
// Referat -> protocol
// -----------------------------------------------------------------------------

/** Split a referat body into its preamble and its `## ` sections. */
export function parseReferat(markdown: string): Referat {
  const lines = markdown.split(/\r?\n/)
  const preamble: string[] = []
  const sections: Section[] = []
  let current: { title: string; body: string[] } | null = null

  for (const line of lines) {
    const h2 = line.trim().match(/^##\s+(.*)$/)
    if (h2) {
      if (current) sections.push({ title: current.title, body: current.body.join('\n').trim() })
      current = { title: h2[1]!.trim(), body: [] }
      continue
    }
    if (current) current.body.push(line)
    else preamble.push(line)
  }
  if (current) sections.push({ title: current.title, body: current.body.join('\n').trim() })

  return { preamble: preamble.join('\n').trim(), sections }
}

function normaliseHeading(title: string): string {
  return title
    .toLowerCase()
    .replace(/[.:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Which referat sections make up the protocol, in the order they appear in it.
 * Matching is on normalised headings with a few accepted aliases, because these
 * documents are hand-written and "Action points" has also been "Aksjonspunkter".
 */
const PROTOCOL_SECTIONS: { key: string; label: string; match: RegExp; required: boolean }[] = [
  {
    key: 'attendance',
    label: 'Til stede',
    match: /^(til stede|tilstede|deltakere|til stede og forfall)$/,
    required: true,
  },
  {
    key: 'resolutions',
    label: 'Vedtak',
    match: /^(vedtak|vedtak og beslutninger|beslutninger|vedtak og vedtaksprotokoll)$/,
    required: true,
  },
  {
    key: 'actions',
    label: 'Action points',
    match: /^(action points|aksjonspunkter|oppfolging|oppfølging|oppgaver)$/,
    required: false,
  },
]

export class MissingProtocolSectionError extends Error {
  readonly missing: string[]
  constructor(missing: string[], found: string[]) {
    super(
      `Referatet mangler seksjonen(e) ${missing.join(', ')}, som protokollen bygger på. ` +
        `Seksjoner funnet: ${found.length > 0 ? found.join(', ') : '(ingen)'}.`,
    )
    this.name = 'MissingProtocolSectionError'
    this.missing = missing
  }
}

export interface ProtocolSection {
  key: string
  /** The heading as written in the referat, which is what the PDF prints. */
  title: string
  blocks: Block[]
}

/**
 * Pull the protocol sections out of a referat. Throws if a required section is
 * absent: a protocol without attendance or without vedtak is not a protocol,
 * and issuing an incomplete one silently is exactly the failure this whole
 * feature exists to prevent.
 */
export function extractProtocolSections(minutesMd: string): ProtocolSection[] {
  const referat = parseReferat(minutesMd)
  const found = referat.sections.map((s) => s.title)
  const out: ProtocolSection[] = []
  const missing: string[] = []

  for (const spec of PROTOCOL_SECTIONS) {
    const hit = referat.sections.find((s) => spec.match.test(normaliseHeading(s.title)))
    if (!hit) {
      if (spec.required) missing.push(spec.label)
      continue
    }
    out.push({ key: spec.key, title: hit.title, blocks: parseBlocks(hit.body) })
  }

  if (missing.length > 0) throw new MissingProtocolSectionError(missing, found)
  return out
}

/**
 * The `**Label:** value` lines above the first heading. The PDF prints the
 * meeting's date, time and location from the database columns (machine-written,
 * so authoritative) and these underneath, minus the two that would duplicate.
 */
export function parsePreambleFields(preamble: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  for (const line of preamble.split(/\r?\n/)) {
    const m = line.trim().match(/^\*\*([^:*]+):\*\*\s*(.+)$/)
    if (m) out.push({ label: m[1]!.trim(), value: m[2]!.trim() })
  }
  return out
}
