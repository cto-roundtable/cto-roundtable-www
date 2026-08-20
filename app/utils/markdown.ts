// Minimal, XSS-safe markdown renderer.
//
// Two callers with different needs share it: investor-update bodies (which
// originate from external emails) and board meeting documents (agendas and
// referater authored in the styret repo). Both are treated as untrusted, so we
// NEVER pass raw HTML through. Strategy: escape the whole string first, THEN
// introduce only our own tags for the subset we support — paragraphs, bullet
// and numbered lists, tables, blockquotes, rules, bold, https links, headings.
// No dependency, no raw-HTML sink.
//
// Links are recognised in three forms so an imperfect ingest still stays
// clickable: markdown [text](https://url), autolinks <https://url>, and bare
// https://url. Only http(s) targets are ever turned into anchors, so
// javascript:/data: sinks can never appear.

// Private-use sentinel that wraps a stashed-anchor index. It cannot occur in
// escaped body text, so the restore pass never collides with real content
// (e.g. a bare number surrounded by spaces). Built at runtime to keep the
// source ASCII-clean and free of control chars.
const SENTINEL = String.fromCharCode(0xe000)
const PLACEHOLDER = new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g')

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Inline formatting on already-escaped text.
function inline(s: string): string {
  // Generated anchors are stashed as placeholders so later link passes never
  // re-scan a URL that already lives inside an href.
  const tokens: string[] = []
  const anchor = (url: string, text: string): string => {
    tokens.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`)
    return `${SENTINEL}${tokens.length - 1}${SENTINEL}`
  }

  let out = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  // 1. Markdown links: [text](https://url). Escaped text keeps :// intact.
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) => anchor(url, text))
  // 2. Autolinks: <https://url> (the angle brackets were escaped to &lt;/&gt;).
  out = out.replace(/&lt;(https?:\/\/[^\s]+?)&gt;/g, (_m, url) => anchor(url, url))
  // 3. Bare URLs: https://url, keeping trailing sentence punctuation outside the link.
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, pre, url) => {
    const trail = url.match(/[.,;:!?]+$/)
    const clean = trail ? url.slice(0, url.length - trail[0].length) : url
    return `${pre}${anchor(clean, clean)}${trail ? trail[0] : ''}`
  })
  // Restore the protected anchors.
  return out.replace(PLACEHOLDER, (_m, i) => tokens[Number(i)])
}

export interface MarkdownOptions {
  /**
   * How to render `#` headings.
   * - `'inline'` (default): a bold paragraph, which is what the investor-update
   *   feed has always done and what its styling expects.
   * - `'levels'`: real `h2`-`h5` elements, for long documents like a board
   *   agenda where the hierarchy is the point. `#` maps to h2 so the page's own
   *   h1 stays the only h1.
   */
  headings?: 'inline' | 'levels'
}

/** Is this an escaped markdown table row, i.e. `| a | b |`? */
function isTableRow(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|') && line.length > 2
}

/** Is this the `|---|:--:|` separator directly under a table header? */
function isTableSeparator(line: string): boolean {
  return isTableRow(line) && /^\|[\s:|-]+\|$/.test(line) && line.includes('-')
}

/** Split `| a | b |` into its cells, dropping the leading/trailing empties. */
function tableCells(line: string): string[] {
  return line
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim())
}

/**
 * Render already-escaped lines. Split out from `renderMarkdown` so blockquotes
 * can recurse into their own content without escaping it a second time.
 */
function renderBlocks(lines: string[], opts: MarkdownOptions): string {
  const html: string[] = []
  // Items are held as raw text, not as finished <li>, so a hard-wrapped item can
  // still have its continuation appended before it is rendered. Rendering each
  // line as it arrived also broke `**bold**` that spanned the wrap.
  let bullets: string[] | null = null
  let ordered: string[] | null = null
  let para: string[] = []

  const flushBullets = () => {
    if (bullets) {
      html.push(`<ul>${bullets.map((b) => `<li>${inline(b)}</li>`).join('')}</ul>`)
      bullets = null
    }
  }
  const flushOrdered = () => {
    if (ordered) {
      html.push(`<ol>${ordered.map((o) => `<li>${inline(o)}</li>`).join('')}</ol>`)
      ordered = null
    }
  }
  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${inline(para.join(' '))}</p>`)
      para = []
    }
  }
  const flushAll = () => {
    flushPara()
    flushBullets()
    flushOrdered()
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (!line) {
      flushAll()
      continue
    }

    // Horizontal rule. Checked before bullets so `---` is never a list item.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushAll()
      html.push('<hr>')
      continue
    }

    // Table: a header row followed by a `|---|` separator. Anything after that
    // which still looks like a row is a body row.
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
      flushAll()
      const head = tableCells(line).map((c) => `<th>${inline(c)}</th>`)
      const body: string[] = []
      let j = i + 2
      for (; j < lines.length; j++) {
        const row = lines[j].trim()
        if (!isTableRow(row)) break
        body.push(
          `<tr>${tableCells(row)
            .map((c) => `<td>${inline(c)}</td>`)
            .join('')}</tr>`,
        )
      }
      html.push(
        `<div class="md-table-wrap"><table class="md-table"><thead><tr>${head.join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>`,
      )
      i = j - 1
      continue
    }

    // Blockquote: consecutive `>` lines rendered as their own little document,
    // so bullets, bold and links inside a callout still work.
    if (line.startsWith('&gt;')) {
      flushAll()
      const quoted: string[] = []
      let j = i
      for (; j < lines.length; j++) {
        const q = lines[j].trim()
        if (!q.startsWith('&gt;')) break
        quoted.push(q.replace(/^&gt;\s?/, ''))
      }
      html.push(`<blockquote>${renderBlocks(quoted, opts)}</blockquote>`)
      i = j - 1
      continue
    }

    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      flushPara()
      flushOrdered()
      if (!bullets) bullets = []
      bullets.push(bullet[1])
      continue
    }

    const numbered = line.match(/^\d+\.\s+(.*)$/)
    if (numbered) {
      flushPara()
      flushBullets()
      if (!ordered) ordered = []
      ordered.push(numbered[1])
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushAll()
      if (opts.headings === 'levels') {
        // `#` starts at h2: the page supplies the only h1.
        const level = Math.min(heading[1].length + 1, 5)
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      } else {
        html.push(`<p class="upd-h"><strong>${inline(heading[2])}</strong></p>`)
      }
      continue
    }

    // Lazy continuation. These documents are hand-written and hard-wrapped at
    // about 80 columns, so a list item routinely spills onto the next line.
    // Treating that line as a new paragraph did real damage: it closed the list,
    // emitted the continuation as its own paragraph BEFORE the rest of the list,
    // and reopened a second <ul> after it. One agenda had 22 wrapped items, so
    // the saksliste arrived shuffled.
    if (bullets && bullets.length > 0) {
      bullets[bullets.length - 1] += ` ${line}`
      continue
    }
    if (ordered && ordered.length > 0) {
      ordered[ordered.length - 1] += ` ${line}`
      continue
    }

    para.push(line)
  }

  flushAll()
  return html.join('\n')
}

export function renderMarkdown(md: string, opts: MarkdownOptions = {}): string {
  if (!md) return ''
  return renderBlocks(escapeHtml(md).split(/\r?\n/), opts)
}

/* ------------------------------------------------------------------ *
 * Document outline
 *
 * A board agenda is 13k characters. Rendered as one blob it is unreadable,
 * so the meeting page shows it as a two-level accordion instead: `##` are
 * the sections, `###` under them are the individual saker. This splits the
 * markdown into that shape without rendering anything, so the page decides
 * what to open.
 * ------------------------------------------------------------------ */

export interface DocSection {
  /** Stable, URL-safe id derived from the title. Used as key and anchor. */
  id: string
  /** Heading text with any trailing `(10 min)` lifted out into `meta`. */
  title: string
  /** The `(10 min)` estimate, when the heading carries one. */
  meta: string | null
  /** Minutes as a number when `meta` is a duration, else null. Lets the page
   *  add up how much of the meeting is actually accounted for. */
  minutes: number | null
  /** Markdown under this heading, excluding any child sections. */
  body: string
  children: DocSection[]
}

export interface DocOutline {
  /** Everything before the first `##`, e.g. the date/location block. */
  preamble: string
  sections: DocSection[]
}

function sectionId(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return base ? `${base.slice(0, 40)}-${index}` : `del-${index}`
}

/** `Sak 1: Noe (10 min)` -> title without the parenthetical, plus the meta. */
function splitMeta(heading: string): { title: string; meta: string | null; minutes: number | null } {
  const m = heading.match(/^(.*?)\s*\(([^()]*\d+[^()]*)\)\s*$/)
  if (!m) return { title: heading, meta: null, minutes: null }
  const mins = m[2].match(/^\s*(\d+)\s*min/i)
  // Only a trailing duration is a badge. A parenthetical like "(fysisk)" or
  // "(til årsmøtet)" is part of the title and must stay in it.
  if (!mins) return { title: heading, meta: null, minutes: null }
  return { title: m[1].trim(), meta: m[2].trim(), minutes: Number(mins[1]) }
}

export function outlineMarkdown(md: string): DocOutline {
  if (!md) return { preamble: '', sections: [] }

  const lines = md.split(/\r?\n/)
  const preamble: string[] = []
  const sections: DocSection[] = []
  let current: DocSection | null = null
  let child: DocSection | null = null
  let n = 0

  const push = (line: string) => {
    if (child) child.body += `${line}\n`
    else if (current) current.body += `${line}\n`
    else preamble.push(line)
  }

  for (const line of lines) {
    const h = line.match(/^(#{2,3})\s+(.*)$/)
    if (!h) {
      push(line)
      continue
    }
    const { title, meta, minutes } = splitMeta(h[2].trim())
    const node: DocSection = { id: sectionId(title, n++), title, meta, minutes, body: '', children: [] }
    if (h[1].length === 2) {
      sections.push(node)
      current = node
      child = null
    } else if (current) {
      current.children.push(node)
      child = node
    } else {
      // A `###` before any `##`: treat it as a section of its own rather than
      // dropping it on the floor.
      sections.push(node)
      current = node
      child = null
    }
  }

  // `---` separators sit between sections in the source, so they always land at
  // the end of the preceding body. Inside a collapsible they are just a stray
  // line under the content, so drop them from the edges.
  const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
  const trim = (s: DocSection) => {
    const lines = s.body.split('\n')
    while (lines.length && (lines[0].trim() === '' || RULE.test(lines[0]))) lines.shift()
    while (lines.length && (lines[lines.length - 1].trim() === '' || RULE.test(lines[lines.length - 1]))) lines.pop()
    s.body = lines.join('\n')
    s.children.forEach(trim)
  }
  sections.forEach(trim)

  return { preamble: preamble.join('\n').trim(), sections }
}
