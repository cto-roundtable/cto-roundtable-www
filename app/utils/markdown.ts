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
  let bullets: string[] | null = null
  let ordered: string[] | null = null
  let para: string[] = []

  const flushBullets = () => {
    if (bullets) {
      html.push(`<ul>${bullets.join('')}</ul>`)
      bullets = null
    }
  }
  const flushOrdered = () => {
    if (ordered) {
      html.push(`<ol>${ordered.join('')}</ol>`)
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
      bullets.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }

    const numbered = line.match(/^\d+\.\s+(.*)$/)
    if (numbered) {
      flushPara()
      flushBullets()
      if (!ordered) ordered = []
      ordered.push(`<li>${inline(numbered[1])}</li>`)
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

    flushBullets()
    flushOrdered()
    para.push(line)
  }

  flushAll()
  return html.join('\n')
}

export function renderMarkdown(md: string, opts: MarkdownOptions = {}): string {
  if (!md) return ''
  return renderBlocks(escapeHtml(md).split(/\r?\n/), opts)
}
