/**
 * The script DocumentViewer puts into the document it frames (components/document/).
 *
 * The frame is a `srcdoc` iframe sandboxed WITHOUT allow-same-origin: the document runs
 * in an opaque origin and cannot read the portal's cookies, storage or API. It can only
 * talk to the viewer by postMessage. Every message carries `dv: 1`; the viewer checks
 * `event.source` (the origin is "null"), and this script answers only its parent.
 *
 * What it does inside the document:
 *   - links: a link to another site, mail or phone opens in a new tab (it would do
 *     nothing in the frame); a relative link is resolved against the portal; `#id`
 *     goes to that element (the slide it is on, in slide mode).
 *   - slides: a document with two or more slides (`[data-slide]`, else `section.slide`,
 *     else `.slides > section`) can be shown one slide at a time. The arrow keys,
 *     Page Up/Down, Home/End and a horizontal swipe move between them, and the viewer
 *     can ask for any slide. A document without slides stays a scrolling page.
 *   - it tells the viewer the slides (id and title), which one is shown, and Escape.
 *
 * To the viewer:   ready { count, slides: [{ id, title }], index, mode } · at { index } · key { key }
 * From the viewer: goto { index } · mode { slides } · anchor { id }
 */

export interface FrameConfig {
  /** Start in slide mode when the document has slides. */
  slides: boolean
  /** Which slide to start on (0-based). */
  start: number
  /** The portal's origin: relative links in the document are resolved against it. */
  base: string
}

export interface FrameSlide {
  id: string | null
  title: string
}

export type FromDocumentFrame =
  | { dv: 1; type: 'ready'; count: number; slides: FrameSlide[]; index: number; mode: 'slides' | 'scroll' }
  | { dv: 1; type: 'at'; index: number }
  | { dv: 1; type: 'key'; key: string }

export type ToDocumentFrame =
  | { dv: 1; type: 'goto'; index: number }
  | { dv: 1; type: 'mode'; slides: boolean }
  | { dv: 1; type: 'anchor'; id: string }

/** The document's own selectors for a slide, in order of preference. */
export const SLIDE_SELECTORS = ['[data-slide]', 'section.slide', '.slides > section']

// Runs INSIDE the frame. It is serialised with toString(), so it must be self-contained:
// no imports, no closures over this module, nothing but the browser's own globals.
function frameRuntime(cfg: FrameConfig, selectors: string[]) {
  const w = window as any
  if (w.__portalDocumentViewer) return
  w.__portalDocumentViewer = true
  const parentWin = window.parent
  function post(message: Record<string, unknown>) {
    parentWin.postMessage(Object.assign({ dv: 1 }, message), '*')
  }

  let slides: HTMLElement[] = []
  for (const selector of selectors) {
    const found = Array.from(document.querySelectorAll<HTMLElement>(selector))
    if (found.length >= 2) {
      slides = found
      break
    }
  }
  // A slide inside another slide is part of it, not a slide of its own.
  slides = slides.filter((el) => !slides.some((other) => other !== el && other.contains(el)))
  let mode: 'slides' | 'scroll' = cfg.slides && slides.length >= 2 ? 'slides' : 'scroll'
  let at = Math.max(0, Math.min(slides.length - 1, cfg.start || 0))

  const style = document.createElement('style')
  style.setAttribute('data-portal-viewer', '')
  style.textContent = [
    'html.dv-slides, html.dv-slides body { height: 100%; overflow: hidden; scroll-snap-type: none !important; }',
    'html.dv-slides .dv-off { display: none !important; }',
    'html.dv-slides .dv-on { min-height: 100vh; height: 100vh; overflow-y: auto; box-sizing: border-box; scroll-snap-align: none; }',
  ].join('\n')
  document.head.appendChild(style)

  function titleOf(el: HTMLElement): string {
    const heading = el.querySelector('h1, h2, h3')
    const text = (heading ? heading.textContent : el.getAttribute('aria-label')) || ''
    return text.replace(/\s+/g, ' ').trim().slice(0, 140)
  }

  function apply() {
    document.documentElement.classList.toggle('dv-slides', mode === 'slides')
    slides.forEach((el, i) => {
      el.classList.toggle('dv-on', mode === 'slides' && i === at)
      el.classList.toggle('dv-off', mode === 'slides' && i !== at)
    })
    if (mode === 'slides' && slides[at]) slides[at].scrollTop = 0
  }

  function go(i: number) {
    if (!slides.length) return
    const next = Math.max(0, Math.min(slides.length - 1, i))
    at = next
    if (mode === 'slides') apply()
    else slides[at].scrollIntoView({ behavior: 'smooth', block: 'start' })
    post({ type: 'at', index: at })
  }

  function slideOf(el: Element): number {
    return slides.findIndex((s) => s === el || s.contains(el))
  }

  function toAnchor(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    const i = slideOf(el)
    if (mode === 'slides' && i >= 0) {
      go(i)
      if (el !== slides[i]) el.scrollIntoView({ block: 'center' })
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Links. Ones out of the document get a new tab up front (so a middle click, a long
  // press and the status bar all show what will happen); in-page ones are handled here.
  function prepareLinks() {
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const href = a.getAttribute('href') || ''
      if (href.startsWith('#')) continue
      let url: URL
      try {
        url = new URL(href, cfg.base)
      } catch (_) {
        continue
      }
      if (!/^(https?|mailto|tel):$/.test(url.protocol)) continue
      a.setAttribute('href', url.href)
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    }
  }
  prepareLinks()

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as Element | null
      const a = target && target.closest ? (target.closest('a[href]') as HTMLAnchorElement | null) : null
      if (!a) return
      const href = a.getAttribute('href') || ''
      if (href.startsWith('#')) {
        e.preventDefault()
        if (href.length > 1) toAnchor(decodeURIComponent(href.slice(1)))
        return
      }
      // Anything prepareLinks did not make a new-tab link (javascript:, data:, a link a
      // script added later with another scheme) goes nowhere, rather than replacing the frame.
      if (a.getAttribute('target') !== '_blank') {
        let url: URL | null = null
        try {
          url = new URL(href, cfg.base)
        } catch (_) {
          url = null
        }
        e.preventDefault()
        if (url && /^(https?|mailto|tel):$/.test(url.protocol)) window.open(url.href, '_blank', 'noopener')
      }
    },
    true,
  )

  function typing(el: EventTarget | null): boolean {
    const node = el as HTMLElement | null
    if (!node || !node.tagName) return false
    return /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName) || node.isContentEditable
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return
    if (e.key === 'Escape') {
      post({ type: 'key', key: 'Escape' })
      return
    }
    if (mode !== 'slides') return
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(at + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(slides.length - 1)
    else return
    e.preventDefault()
  })

  // A horizontal swipe, clearly more sideways than down, is a slide change.
  let touch: { x: number; y: number } | null = null
  document.addEventListener(
    'touchstart',
    (e) => {
      touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
    },
    { passive: true },
  )
  document.addEventListener(
    'touchend',
    (e) => {
      if (!touch || mode !== 'slides' || e.changedTouches.length !== 1) return
      const dx = e.changedTouches[0].clientX - touch.x
      const dy = e.changedTouches[0].clientY - touch.y
      touch = null
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      // Not while the reader is selecting words.
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed) return
      go(dx < 0 ? at + 1 : at - 1)
    },
    { passive: true },
  )

  // In scroll mode, the slide most in view is the current one (for the counter).
  if (slides.length >= 2 && 'IntersectionObserver' in window) {
    const seen = new Map<Element, number>()
    const io = new IntersectionObserver(
      (entries) => {
        if (mode !== 'scroll') return
        for (const entry of entries) seen.set(entry.target, entry.intersectionRatio)
        let best = at
        let bestRatio = 0
        slides.forEach((el, i) => {
          const r = seen.get(el) || 0
          if (r > bestRatio) {
            best = i
            bestRatio = r
          }
        })
        if (best !== at && bestRatio > 0.3) {
          at = best
          post({ type: 'at', index: at })
        }
      },
      { threshold: [0, 0.3, 0.6, 1] },
    )
    for (const el of slides) io.observe(el)
  }

  window.addEventListener('message', (e) => {
    if (e.source !== parentWin) return
    const d = e.data
    if (!d || d.dv !== 1) return
    if (d.type === 'goto' && typeof d.index === 'number') go(d.index)
    else if (d.type === 'mode') {
      mode = d.slides && slides.length >= 2 ? 'slides' : 'scroll'
      apply()
      if (mode === 'scroll' && slides[at]) slides[at].scrollIntoView({ block: 'start' })
      post({ type: 'at', index: at })
    } else if (d.type === 'anchor' && typeof d.id === 'string') toAnchor(d.id)
  })

  apply()
  if (mode === 'scroll' && at > 0 && slides[at]) slides[at].scrollIntoView({ block: 'start' })
  post({
    type: 'ready',
    count: slides.length,
    slides: slides.map((el) => ({ id: el.id || null, title: titleOf(el) })),
    index: at,
    mode,
  })
}

/**
 * The document with the viewer's script added (before </body>, else at the end). The
 * document's own bytes are untouched otherwise; the stored version (and its sha256) is
 * what the API serves, this is only what the frame shows.
 */
export function withDocumentFrame(html: string, cfg: FrameConfig): string {
  const args = JSON.stringify([cfg, SLIDE_SELECTORS]).replace(/</g, '\\u003c')
  const script = `<script data-portal-viewer>(${frameRuntime.toString()}).apply(null, ${args});</script>`
  const end = html.toLowerCase().lastIndexOf('</body>')
  return end === -1 ? html + script : html.slice(0, end) + script + html.slice(end)
}
