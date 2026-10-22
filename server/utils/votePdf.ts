/**
 * Renders the protocol of a closed deal vote (deal_rounds) as PDF. It is mailed
 * to every member of the SPV and is the record that outlives the portal
 * (research/voting-process.md §4.4 in ctori-4): what was proposed, on which
 * documents (hashes), under which rule, who was on the roster, who TOOK PART,
 * the counts and the result. It does NOT say what anyone voted: choices are the
 * committee's and the board's only (decision 2026-10-22 on the vote model). The
 * named ballots stay in deal_rounds.result_snapshot.
 *
 * Same engine and fonts as the styreprotokoll (server/utils/protocolPdf.ts, see
 * its header for why pdfkit and Base-14). The bytes are deterministic for a
 * given round: CreationDate is the deadline, not the time the close ran, so a
 * retried close renders the same file and the same hash.
 */
import PDFDocument from 'pdfkit'
import type { Tally } from './dealRounds'
import { toPdfText } from './protocolMarkdown.ts'

const BODY = 'Helvetica'
const BOLD = 'Helvetica-Bold'
const MONO = 'Courier'
const MARGIN = 56
const INK = '#111111'
const MUTED = '#555555'
const RULE = '#bbbbbb'

/** WinAnsi only: a character the font cannot set becomes '?', never a broken close. */
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

const METHOD: Record<string, string> = { portal: 'i portalen', email: 'på e-post', on_behalf: 'registrert på vegne' }
const RESULT: Record<string, string> = {
  passed: 'VEDTATT',
  failed: 'IKKE VEDTATT',
  no_quorum: 'IKKE VEDTATT (ingen ja- eller nei-stemmer)',
}

export interface VoteProtocolInput {
  round: any
  tally: Tally
  result: 'passed' | 'failed' | 'no_quorum'
  participants: { name: string; method: string }[]
  absent: { name: string; late: boolean }[]
}

export async function renderVoteProtocolPdf(input: VoteProtocolInput): Promise<Buffer> {
  const { round: r, tally, result } = input
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN + 30, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: pdfText(`Protokoll fra avstemning: ${r.deal_name}, ${r.group_name ?? r.group_slug}`),
      Author: 'CTO Roundtable',
      Subject: pdfText(`Avstemning ${r.id}. Grunnlag sha256 ${r.bundle_sha256}.`),
      CreationDate: new Date(r.closes_at),
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
  const line = (text: string, opts: { muted?: boolean; mono?: boolean; size?: number } = {}) => {
    doc
      .font(opts.mono ? MONO : BODY)
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

  doc.font(BOLD).fontSize(18).fillColor(INK).text(pdfText('Protokoll fra avstemning'), { width })
  doc.moveDown(0.2)
  line(`${r.deal_name}, ${r.group_name ?? r.group_slug}`, { size: 13 })
  rule()

  h('Resultat')
  doc
    .font(BOLD)
    .fontSize(14)
    .fillColor(INK)
    .text(pdfText(RESULT[result] ?? result), { width })
  doc.moveDown(0.3)
  line(
    `Ja ${tally.yes}, nei ${tally.no}, blankt ${tally.blank}, stående blank ${tally.defaultBlank}, ikke stemt ${tally.notVoted}. ` +
      `${tally.eligible} stemmeberettigede.`,
  )
  const base = tally.yes + tally.no
  line(
    base
      ? `Ja utgjør ${((tally.yes / base) * 100).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} % av ja- og nei-stemmene. Kravet er minst 2/3.`
      : 'Ingen ja- eller nei-stemmer.',
    { muted: true },
  )

  h('Forslaget')
  const p = r.proposal ?? {}
  if (p.amount) {
    line(
      `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(p.amount)} ${p.currency ?? ''}, ${p.instrument ?? ''}` +
        (p.cap ? `, cap ${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(p.cap)}` : ''),
    )
  }
  if (p.termsSummary) line(p.termsSummary)

  h('Grunnlaget')
  for (const d of (r.documents ?? []) as any[]) {
    line(`${d.title ?? d.key} (versjon ${d.version})`)
    line(`sha256 ${d.sha256}`, { mono: true, size: 8, muted: true })
  }
  line(`Hele grunnlaget, sha256 ${r.bundle_sha256}`, { mono: true, size: 8, muted: true })

  h('Regelen')
  line(
    'Én stemme per aksjonær. Blanke stemmer og de som ikke stemmer telles ikke. Forslaget er vedtatt når minst 2/3 av ' +
      'ja- og nei-stemmene er ja. Frist 48 timer fra åpning. Medlemmene så antall stemmer underveis, ikke hvem som stemte hva.',
  )
  line(`Åpnet ${stamp(r.opened_at)}. Frist ${stamp(r.closes_at)}.`, { muted: true })

  h(`Deltok (${input.participants.length})`)
  if (input.participants.length === 0) line('Ingen.', { muted: true })
  for (const x of input.participants) line(`${x.name}, ${METHOD[x.method] ?? x.method}`)

  h(`Deltok ikke (${input.absent.length})`)
  if (input.absent.length === 0) line('Ingen.', { muted: true })
  for (const x of input.absent) line(x.late ? `${x.name} (stemme kom etter fristen, ikke talt)` : x.name)

  rule()
  line(
    'Protokollen viser hvem som deltok, ikke hva hver enkelt stemte. De navngitte stemmene er lagret og kan ' +
      'kontrolleres av komiteen og styret.',
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
          `Avstemning ${r.id} · grunnlag ${String(r.bundle_sha256).slice(0, 16)} · side ${i + 1} av ${pages.count}`,
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
