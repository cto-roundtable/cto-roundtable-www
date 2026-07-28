// Minimal, XSS-safe markdown renderer for investor-update bodies.
//
// Update bodies originate from external emails, so we NEVER pass raw HTML
// through. Strategy: escape the whole string first, THEN introduce only our own
// tags for the small subset the triage skill emits (paragraphs, bullet lists,
// bold, https links, headings). No dependency, no raw-HTML sink.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Inline formatting on already-escaped text.
function inline(s: string): string {
  let out = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Links: only http(s) targets (escaped text keeps :// intact); blocks javascript: etc.
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`,
  )
  return out
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
