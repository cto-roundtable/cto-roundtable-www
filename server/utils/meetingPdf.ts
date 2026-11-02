/**
 * Renders the protocol of a general meeting (årsmøte) as PDF, one section per
 * sak, for the referat: who attended, the rule, the count and the result, and
 * the chair's lot where a majority sak tied (vedtekter § 5.5). Built from the
 * frozen result snapshots (meeting_items.result_snapshot), so the same meeting
 * always renders the same text; CreationDate is when the session closed (or
 * the last sak closed), never "now".
 *
 * Same engine and fonts as the deal vote protocol (votePdf.ts) and the
 * styreprotokoll (protocolPdf.ts, see its header for why pdfkit and Base-14).
 * An open ballot lists who voted what; a secret ballot only who voted.
 */
import PDFDocument from 'pdfkit'
import { toPdfText } from './protocolMarkdown.ts'

const BODY = 'Helvetica'
const BOLD = 'Helvetica-Bold'
const MONO = 'Courier'
const MARGIN = 56
const INK = '#111111'
const MUTED = '#555555'
const RULE = '#bbbbbb'

function pdfText(input: string): string {
  try {
    return toPdfText(input)
  } catch {
    let out = ''
    for (const ch of input) {
      try {
        out += toPdfText(ch)
      } catch {
        out += '?'
      }
    }
    return out
  }
}

const stamp = (value: string | Date) =>
  new Date(value).toLocaleString('nb-NO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Oslo',
  })

const KIND: Record<string, string> = {
  ordinary: 'Ordinært årsmøte',
  extraordinary: 'Ekstraordinært årsmøte',
  trial: 'Prøvemøte for styret (PRØVE, ikke et årsmøte)',
}
const CHOICE: Record<string, string> = { yes: 'ja', no: 'nei', blank: 'blankt' }

export async function renderMeetingProtocolPdf(input: {
  view: Awaited<ReturnType<typeof meetingView>>
  attended: string[]
  stampAt: string | Date
}): Promise<Buffer> {
  const { meeting: m, items } = input.view
  const trial = m.kind === 'trial'
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN + 30, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: pdfText(`Protokoll: ${m.title}`),
      Author: 'CTO Roundtable',
      Subject: pdfText(`Årsmøte ${m.id}. Manntall sha256 ${m.rosterSha256 ?? ''}.`),
      CreationDate: new Date(input.stampAt),
    },
  })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const finished = new Promise<void>((resolve) => doc.on('end', () => resolve()))
  const width = doc.page.width - MARGIN * 2

  const h = (text: string, size = 12) => {
    doc.moveDown(0.8).font(BOLD).fontSize(size).fillColor(INK).text(pdfText(text), { width })
    doc.moveDown(0.3)
  }
  const line = (text: string, opts: { muted?: boolean; mono?: boolean; size?: number; bold?: boolean } = {}) => {
    doc
      .font(opts.mono ? MONO : opts.bold ? BOLD : BODY)
      .fontSize(opts.size ?? 10.5)
      .fillColor(opts.muted ? MUTED : INK)
      .text(pdfText(text), { width, lineGap: 2.5 })
  }
  const rule = () => {
    doc.moveDown(0.5)
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + width, doc.y)
      .strokeColor(RULE)
      .lineWidth(0.6)
      .stroke()
    doc.moveDown(0.5)
  }

  doc
    .font(BOLD)
    .fontSize(18)
    .fillColor(INK)
    .text(pdfText(`Protokoll: ${m.title}`), { width })
  doc.moveDown(0.2)
  line(KIND[m.kind] ?? m.kind, { size: 12 })
  if (m.heldAt) line(`Tid: ${stamp(m.heldAt)}${m.place ? `. Sted: ${m.place}` : ''}`)
  if (m.status !== 'closed') line('Foreløpig: møtet er ikke avsluttet.', { bold: true })
  rule()

  line(`Møteleder: ${m.chair?.name ?? 'ikke satt'}. Referent: ${m.secretary?.name ?? 'ikke satt'}.`)
  line(
    `Manntall: ${m.rosterCount} stemmeberettigede, låst ${m.rosterFrozenAt ? stamp(m.rosterFrozenAt) : ''}` +
      `${m.rosterEligible !== m.rosterCount ? ` (${m.rosterEligible} med stemmerett)` : ''}.`,
  )
  line(`sha256 ${m.rosterSha256 ?? ''}`, { mono: true, size: 8, muted: true })
  line(
    m.countBase === 'yes+no+blank'
      ? 'Blanke stemmer regnes som avgitte stemmer.'
      : 'Blanke stemmer regnes ikke som avgitte stemmer.',
    { muted: true },
  )

  h(`Møtte (${input.attended.length})`)
  line(input.attended.length ? input.attended.join(', ') : 'Ingen registrert.')
  line('Årsmøtet er vedtaksført med de stemmeberettigede som møter (§ 5.1).', { muted: true })

  for (const it of items) {
    rule()
    h(`Sak ${it.position}: ${it.title}`)
    if (it.body) line(it.body)
    if (it.status === 'withdrawn') {
      line(`Trukket: ${it.withdrawReason ?? ''}`, { muted: true })
      continue
    }
    if (it.status !== 'closed' || !it.protocolText) {
      line('Ikke behandlet.', { muted: true })
      continue
    }
    doc.moveDown(0.3)
    for (const l of it.protocolText.split('\n').slice(1)) line(l)
    if (it.named?.length) {
      doc.moveDown(0.3)
      line('Åpen avstemning, stemmene:', { muted: true })
      line(it.named.map((x) => `${x.name} (${CHOICE[x.choice] ?? x.choice})`).join(', '), { size: 9.5 })
    }
    if (it.voters?.length) {
      doc.moveDown(0.3)
      line(`Hemmelig avstemning. Disse stemte (${it.voters.length}), ikke hva:`, { muted: true })
      line(it.voters.join(', '), { size: 9.5 })
    }
  }

  rule()
  line(
    'Tellingene er frosset når møteleder lukket hver sak, og kan ikke endres. Ved stemmelikhet i en sak med ' +
      'alminnelig flertall trakk møteleder lodd i møtet og førte utfallet inn (§ 5.5).',
    { muted: true, size: 9 },
  )

  const pages = doc.bufferedPageRange()
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i)
    const bottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc
      .font(MONO)
      .fontSize(7)
      .fillColor(MUTED)
      .text(
        pdfText(
          `${trial ? 'PRØVE · ' : ''}Møte ${m.id} · manntall ${String(m.rosterSha256 ?? '').slice(0, 16)} · side ${i + 1} av ${pages.count}`,
        ),
        MARGIN,
        doc.page.height - MARGIN,
        { width, align: 'center', lineBreak: false },
      )
    doc.page.margins.bottom = bottom
  }

  doc.end()
  await finished
  return Buffer.concat(chunks)
}
