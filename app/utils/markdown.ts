// Minimal, XSS-safe markdown renderer for investor-update bodies.
//
// Update bodies originate from external emails, so we NEVER pass raw HTML
// through. Strategy: escape the whole string first, THEN introduce only our own
// tags for the small subset the triage skill emits (paragraphs, bullet lists,
// bold, https links, headings). No dependency, no raw-HTML sink.
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

export function renderMarkdown(md: string): string {
  if (!md) return ''
  const lines = escapeHtml(md).split(/\r?\n/)
  const html: string[] = []
  let list: string[] | null = null
  let para: string[] = []

  const flushList = () => {
    if (list) {
      html.push(`<ul>${list.join('')}</ul>`)
      list = null
    }
  }
  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${inline(para.join(' '))}</p>`)
      para = []
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushPara()
      flushList()
      continue
    }
    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      flushPara()
      if (!list) list = []
      list.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) {
      flushPara()
      flushList()
      html.push(`<p class="upd-h"><strong>${inline(heading[1])}</strong></p>`)
      continue
    }
    flushList()
    para.push(line)
  }
  flushPara()
  flushList()
  return html.join('\n')
}
