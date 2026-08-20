/**
 * Renders a styreprotokoll as PDF.
 *
 * Font choice: the PDF Base-14 fonts (Helvetica), not an embedded one. Not for
 * lack of trying — pdfkit embeds fonts through fontkit's subsetter, and that
 * subsetter throws `RangeError: Offset is outside the bounds of the DataView`
 * on both WOFF2 input and on variable TTFs, which is what Google ships for the
 * site's own typefaces. Base-14 has no asset to bundle, cannot break in the
 * Nitro output, renders identically everywhere, and is unremarkable on a legal
 * document. The cost is WinAnsi's character repertoire, and protocolMarkdown.ts
 * turns that cost into a loud error instead of a silent mangled glyph.
 *
 * Engine choice: pdfkit server-side, not headless Chrome. Cloud Run gives this
 * service 512Mi and one vCPU with scale-to-zero; Chromium alone would not fit,
 * and it would add ~300MB to an image that currently deploys on every push.
 * Client-side generation was rejected for a stronger reason: the protocol is
 * hashed and that hash is the anchor of the whole audit trail, so the bytes have
 * to be produced in one place we control, not once per browser.
 */
import PDFDocument from 'pdfkit'
import {
  type Block,
  extractProtocolSections,
  parsePreambleFields,
  parseReferat,
  type Run,
  toPdfText,
} from './protocolMarkdown.ts'

const BODY = 'Helvetica'
const BOLD = 'Helvetica-Bold'
const ITALIC = 'Helvetica-Oblique'
const BOLD_ITALIC = 'Helvetica-BoldOblique'
const MONO = 'Courier'

function fontFor(run: Run, forceBold = false): string {
  if (run.code) return MONO
  const bold = run.bold || forceBold
  if (bold && run.italic) return BOLD_ITALIC
  if (bold) return BOLD
  if (run.italic) return ITALIC
  return BODY
}

const PAGE_MARGIN = 56
const FOOTER_HEIGHT = 34

const SIZE_BODY = 10.5
const SIZE_SMALL = 9
const SIZE_FOOTER = 7
const LINE_GAP = 2.5

const INK = '#111111'
const MUTED = '#555555'
const RULE = '#bbbbbb'

const ORG_NAME = 'CTO Roundtable'
const ORG_NUMBER = '937876351'

export interface ProtocolMeeting {
  slug: string
  number: number
  title: string | null
  /** YYYY-MM-DD */
  meetingDate: string
  startsAt: string | Date | null
  endsAt: string | Date | null
  location: string | null
}

export interface ProtocolRenderInput {
  meeting: ProtocolMeeting
  /** The frozen referat text this protocol version is built from. */
  minutesMd: string
  version: number
  /** UUID of the board_protocols row. Printed so the file names its register entry. */
  protocolId: string
  /** sha256 of `minutesMd`. Printed on every page, see the note in the footer code. */
  contentSha256: string
  chairName: string
  issuedAt: Date
  /** Absolute URL of the meeting in the portal, for the pointer to the full referat. */
  referatUrl: string | null
}

function osloDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Oslo',
  })
}

function osloTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Oslo',
  })
}

function osloTimestamp(value: Date): string {
  const d = value.toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Oslo',
  })
  return `${d}, kl. ${osloTime(value)}`
}

function plain(runs: Run[]): string {
  return runs.map((r) => r.text).join('')
}

export async function renderProtocolPdf(input: ProtocolRenderInput): Promise<Buffer> {
  const { meeting, version, protocolId, contentSha256, chairName, issuedAt } = input

  // Parse before opening the document: a missing section or an unrenderable
  // character must fail before anything is written, not halfway down page two.
  const sections = extractProtocolSections(input.minutesMd)
  const preambleFields = parsePreambleFields(parseReferat(input.minutesMd).preamble)
  toPdfText(input.minutesMd)

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN + FOOTER_HEIGHT, left: PAGE_MARGIN, right: PAGE_MARGIN },
    bufferPages: true,
    info: {
      Title: `Protokoll : Styremøte nr. ${meeting.number}, ${ORG_NAME}`,
      Author: `${ORG_NAME} (org.nr ${ORG_NUMBER})`,
      Subject: `Styreprotokoll, versjon ${version}. Innholds-hash sha256 ${contentSha256}.`,
      Keywords: `styreprotokoll ${meeting.slug} v${version} ${protocolId}`,
      CreationDate: issuedAt,
    },
  })

  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const finished = new Promise<void>((resolve) => doc.on('end', () => resolve()))

  const left = doc.page.margins.left
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const bottomLimit = doc.page.height - doc.page.margins.bottom

  // ---------------------------------------------------------------------------
  // Layout primitives
  // ---------------------------------------------------------------------------

  const space = (amount: number) => {
    doc.y += amount
  }

  const ensure = (needed: number) => {
    if (doc.y + needed > bottomLimit) doc.addPage()
  }

  function drawRuns(
    runs: Run[],
    x: number,
    width: number,
    opts: { size?: number; color?: string; forceBold?: boolean } = {},
  ) {
    const size = opts.size ?? SIZE_BODY
    if (runs.length === 0) {
      space(size)
      return
    }
    const y = doc.y
    doc.fillColor(opts.color ?? INK)
    runs.forEach((run, i) => {
      doc.font(fontFor(run, opts.forceBold)).fontSize(size)
      const options = { width, lineGap: LINE_GAP, continued: i < runs.length - 1 }
      if (i === 0) doc.text(toPdfText(run.text), x, y, options)
      else doc.text(toPdfText(run.text), options)
    })
    doc.fillColor(INK)
  }

  /**
   * Height a run sequence will occupy. When every run uses the same face the
   * measurement is exact; when they differ it falls back to bold, which is wider
   * than the others and so never under-reserves. The exact path matters for
   * table rows: measuring a plain cell in bold made it wrap one line further
   * than it really does, and every row in the table inherited the slack.
   */
  function heightOfRuns(runs: Run[], width: number, size = SIZE_BODY, forceBold = false): number {
    const fonts = new Set(runs.map((r) => fontFor(r, forceBold)))
    doc.font(fonts.size === 1 ? [...fonts][0]! : BOLD).fontSize(size)
    return doc.heightOfString(toPdfText(plain(runs)), { width, lineGap: LINE_GAP })
  }

  function horizontalRule(width = contentWidth, color = RULE) {
    ensure(8)
    doc
      .moveTo(left, doc.y)
      .lineTo(left + width, doc.y)
      .lineWidth(0.5)
      .strokeColor(color)
      .stroke()
    space(8)
  }

  function drawTable(header: Run[][], rows: Run[][][], x: number, width: number) {
    const columns = header.length
    if (columns === 0) return

    const padX = 5
    const padY = 4

    // Column widths, measured rather than guessed from character counts. Two
    // numbers per column: what it wants (its longest cell laid out on one line)
    // and what it needs (its longest single word, since a word is what cannot be
    // broken). Proportional-to-want alone gave a "Status" column too narrow for
    // the word "Åpen", which then wrapped to "Åpe/n" and dragged every row's
    // height with it.
    doc.font(BOLD).fontSize(SIZE_SMALL)
    const columnText = header.map((h, i) => [plain(h), ...rows.map((r) => plain(r[i] ?? []))])
    const wants = columnText.map((cells) =>
      Math.min(Math.max(...cells.map((c) => doc.widthOfString(toPdfText(c)))), width * 0.55),
    )
    const needs = columnText.map(
      (cells) =>
        Math.max(...cells.flatMap((c) => c.split(/\s+/).map((w) => doc.widthOfString(toPdfText(w))))) + padX * 2,
    )

    const wantTotal = wants.reduce((a, b) => a + b, 0) || 1
    const widths = wants.map((w) => (w / wantTotal) * width)

    // Raise anything below its minimum, and take the difference back from the
    // columns that have room to spare, in proportion to how much they have.
    let deficit = 0
    for (let i = 0; i < columns; i++) {
      const min = Math.min(needs[i] ?? 0, width / columns)
      if ((widths[i] ?? 0) < min) {
        deficit += min - (widths[i] ?? 0)
        widths[i] = min
      }
    }
    if (deficit > 0) {
      const slack = widths.map((w, i) => Math.max(0, w - Math.min(needs[i] ?? 0, width / columns)))
      const slackTotal = slack.reduce((a, b) => a + b, 0)
      if (slackTotal > 0) {
        for (let i = 0; i < columns; i++) {
          widths[i] = (widths[i] ?? 0) - (deficit * (slack[i] ?? 0)) / slackTotal
        }
      }
    }

    const drawRow = (cells: Run[][], bold: boolean) => {
      const heights = cells.map((c, i) => heightOfRuns(c, (widths[i] ?? width) - padX * 2, SIZE_SMALL, bold))
      const rowHeight = Math.max(...heights, SIZE_SMALL) + padY * 2
      if (doc.y + rowHeight > bottomLimit) {
        doc.addPage()
        drawRow(header, true)
      }
      const top = doc.y
      let cx = x
      cells.forEach((cell, i) => {
        const w = widths[i] ?? width
        doc.y = top + padY
        drawRuns(cell, cx + padX, w - padX * 2, { size: SIZE_SMALL, forceBold: bold })
        cx += w
      })
      doc.y = top + rowHeight
      doc
        .moveTo(x, doc.y)
        .lineTo(x + width, doc.y)
        .lineWidth(0.5)
        .strokeColor(RULE)
        .stroke()
    }

    horizontalRule(width)
    drawRow(header, true)
    for (const row of rows) drawRow(row, false)
    space(6)
  }

  function drawBlocks(blocks: Block[], x: number, width: number) {
    for (const block of blocks) {
      switch (block.type) {
        case 'heading': {
          const size = block.level <= 3 ? 11.5 : SIZE_BODY
          space(6)
          ensure(heightOfRuns(block.runs, width, size) + 6)
          drawRuns(block.runs, x, width, { size, forceBold: true })
          space(3)
          break
        }
        case 'paragraph': {
          ensure(Math.min(heightOfRuns(block.runs, width), 40))
          drawRuns(block.runs, x, width)
          space(5)
          break
        }
        case 'list': {
          const indent = block.ordered ? 20 : 14
          block.items.forEach((item, i) => {
            const marker = block.ordered ? `${i + 1}.` : '•'
            const itemHeight = heightOfRuns(item, width - indent)
            ensure(Math.min(itemHeight, 40))
            const top = doc.y
            doc.font(BODY).fontSize(SIZE_BODY).fillColor(MUTED)
            doc.text(marker, x, top, { width: indent, lineGap: LINE_GAP })
            doc.y = top
            drawRuns(item, x + indent, width - indent)
            space(4)
          })
          space(2)
          break
        }
        case 'quote': {
          const inset = 12
          const top = doc.y
          space(3)
          drawBlocks(block.blocks, x + inset, width - inset)
          const bottom = doc.y
          // The rule is drawn after the text so it spans the real height, which
          // is only known once the text has been laid out. It is skipped when
          // the quote broke across a page, where a single bar would be wrong.
          if (bottom > top) {
            doc
              .moveTo(x + 3, top + 3)
              .lineTo(x + 3, bottom - 3)
              .lineWidth(2)
              .strokeColor(RULE)
              .stroke()
          }
          space(4)
          break
        }
        case 'table':
          drawTable(block.header, block.rows, x, width)
          break
        case 'rule':
          horizontalRule(width)
          break
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cover
  // ---------------------------------------------------------------------------

  doc.font(BOLD).fontSize(9).fillColor(MUTED)
  doc.text(`${ORG_NAME.toUpperCase()}  ·  ORG.NR ${ORG_NUMBER}`, left, doc.y, {
    width: contentWidth,
    characterSpacing: 1,
  })
  space(10)

  doc.font(BOLD).fontSize(22).fillColor(INK)
  doc.text('Protokoll', left, doc.y, { width: contentWidth })
  space(2)
  doc.font(BODY).fontSize(14).fillColor(INK)
  doc.text(`Styremøte nr. ${meeting.number}`, left, doc.y, { width: contentWidth })
  space(14)
  horizontalRule()

  const facts: { label: string; value: string }[] = []
  facts.push({ label: 'Dato', value: osloDate(meeting.meetingDate) })
  if (meeting.startsAt) {
    const from = osloTime(meeting.startsAt)
    facts.push({ label: 'Tid', value: meeting.endsAt ? `kl. ${from} til ${osloTime(meeting.endsAt)}` : `kl. ${from}` })
  }
  if (meeting.location) facts.push({ label: 'Sted', value: meeting.location })
  // Preamble fields the database columns do not already carry (Varighet, Kilde).
  for (const field of preambleFields) {
    if (/^(dato|sted)$/i.test(field.label)) continue
    facts.push({ label: field.label, value: field.value })
  }
  facts.push({ label: 'Protokollversjon', value: String(version) })

  const labelWidth = 96
  for (const fact of facts) {
    const height = heightOfRuns([{ text: fact.value }], contentWidth - labelWidth, SIZE_SMALL)
    ensure(height + 4)
    const top = doc.y
    doc.font(BODY).fontSize(SIZE_SMALL).fillColor(MUTED)
    doc.text(toPdfText(fact.label), left, top, { width: labelWidth, lineGap: LINE_GAP })
    doc.y = top
    drawRuns([{ text: fact.value }], left + labelWidth, contentWidth - labelWidth, { size: SIZE_SMALL })
    space(3)
  }

  space(6)
  horizontalRule()
  space(4)

  // ---------------------------------------------------------------------------
  // Body
  // ---------------------------------------------------------------------------

  for (const section of sections) {
    space(10)
    ensure(40)
    doc.font(BOLD).fontSize(13).fillColor(INK)
    doc.text(toPdfText(section.title), left, doc.y, { width: contentWidth })
    space(7)
    drawBlocks(section.blocks, left, contentWidth)
  }

  // ---------------------------------------------------------------------------
  // Where the rest of the referat lives
  //
  // The board resolved that the protocol is the formal record only. Saying so on
  // the document itself is the difference between a deliberate scope and a
  // document that looks like it quietly dropped the inconvenient parts.
  // ---------------------------------------------------------------------------

  space(20)
  ensure(60)
  horizontalRule()
  doc.font(BODY).fontSize(SIZE_SMALL).fillColor(MUTED)
  const pointer =
    'Denne protokollen gjengir det formelle: hvem som var til stede, om møtet var vedtaksført, ' +
    'hva som ble vedtatt, og hva som følger av det. Referatet i sin helhet, med diskusjon, ' +
    'merknader etter møtet og åpne punkter, er tilgjengelig for styret i medlemsportalen' +
    (input.referatUrl ? `: ${input.referatUrl}` : '.')
  doc.text(toPdfText(pointer), left, doc.y, { width: contentWidth, lineGap: LINE_GAP })
  doc.fillColor(INK)

  // ---------------------------------------------------------------------------
  // Signatures
  // ---------------------------------------------------------------------------

  const signatureStatement =
    `Protokollen signeres av møteleder og ett styremedlem, jf. styrets vedtak 20. august 2026. ` +
    `Signaturene bekrefter innholdet i dokumentet med innholds-hash sha256 ${contentSha256}, ` +
    `som står forkortet i bunnteksten på hver side.`

  const SIGNATURE_LINE_HEIGHT = 26 + 4 + (SIZE_SMALL + LINE_GAP) * 2 + 22
  const signatureWidth = 230

  doc.font(BODY).fontSize(SIZE_SMALL)
  const signatureBlockHeight =
    13 +
    7 +
    doc.heightOfString(toPdfText(signatureStatement), { width: contentWidth, lineGap: LINE_GAP }) +
    24 +
    SIGNATURE_LINE_HEIGHT * 2

  // The signature block is atomic. A signature line stranded alone on a final
  // page is the sort of thing that makes a document look unserious precisely
  // where it needs to look the opposite.
  space(20)
  ensure(signatureBlockHeight)

  doc.font(BOLD).fontSize(13).fillColor(INK)
  doc.text('Signatur', left, doc.y, { width: contentWidth })
  space(7)
  doc.font(BODY).fontSize(SIZE_SMALL).fillColor(MUTED)
  doc.text(toPdfText(signatureStatement), left, doc.y, { width: contentWidth, lineGap: LINE_GAP })
  space(24)

  const signatureLine = (role: string, name: string | null) => {
    const top = doc.y
    doc
      .moveTo(left, top + 26)
      .lineTo(left + signatureWidth, top + 26)
      .lineWidth(0.75)
      .strokeColor('#888888')
      .stroke()
    doc.y = top + 30
    doc.font(BOLD).fontSize(SIZE_SMALL).fillColor(INK)
    doc.text(toPdfText(role), left, doc.y, { width: signatureWidth })
    doc.font(BODY).fontSize(SIZE_SMALL).fillColor(MUTED)
    doc.text(toPdfText(name ?? 'Navn og dato'), left, doc.y, { width: signatureWidth })
    doc.fillColor(INK)
    doc.y = top + SIGNATURE_LINE_HEIGHT
  }

  signatureLine('Møteleder', chairName)
  signatureLine('Styremedlem', null)

  // ---------------------------------------------------------------------------
  // Footer on every page
  //
  // The content hash goes here rather than only in the register because the
  // signed file comes back from an external signing service with different
  // bytes: it is stamped, and in a PAdES flow it carries an appended signature.
  // Byte equality with what we generated is therefore impossible to check. A
  // hash printed inside the document survives that round trip and lets anyone
  // holding the signed PDF tie it back to the register entry it came from.
  // ---------------------------------------------------------------------------

  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    // pdfkit starts a fresh page if a write crosses the bottom margin; the
    // footer sits inside that margin on purpose, so the margin is lifted here.
    const savedBottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0

    const y = doc.page.height - PAGE_MARGIN - 12
    doc
      .moveTo(left, y - 8)
      .lineTo(left + contentWidth, y - 8)
      .lineWidth(0.5)
      .strokeColor('#dddddd')
      .stroke()

    doc.font(BODY).fontSize(SIZE_FOOTER).fillColor(MUTED)
    // Abbreviated so the footer stays one line. The full hash is written out in
    // the Signatur section, which is the place it carries legal weight; here it
    // only needs to be enough to tell two versions apart at a glance.
    doc.text(
      toPdfText(
        `${ORG_NAME}, org.nr ${ORG_NUMBER}  ·  Protokoll styremøte nr. ${meeting.number}, versjon ${version}  ` +
          `·  dok ${protocolId.slice(0, 8)}  ·  innhold sha256 ${contentSha256.slice(0, 16)}`,
      ),
      left,
      y,
      { width: contentWidth - 70, lineGap: 1, height: 10 },
    )
    doc.text(`Side ${i - range.start + 1} av ${range.count}`, left + contentWidth - 60, y, {
      width: 60,
      align: 'right',
    })

    doc.page.margins.bottom = savedBottom
  }

  doc.flushPages()
  doc.end()
  await finished
  return Buffer.concat(chunks)
}

/** Issued-at rendered the way the portal shows it, for callers that display it. */
export function formatIssuedAt(issuedAt: Date): string {
  return osloTimestamp(issuedAt)
}
