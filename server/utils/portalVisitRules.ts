// The pure rules of the portal visit log (no database, no Nuxt), pinned by
// tests/unit/portal-visits.test.ts. The writer and the reads are in portalVisits.ts.
//
// Snorre 2026-11-25 (ctori-4 dc-145 H14): "er du logget inn så ser vi besøk på
// nettsiden. Cookies er bare den ikke innlogget vei." A signed-in member is in the
// system and the board needs the feedback, so a page view under /member is logged
// server-side against the person, cookie banner or not. PostHog stays for the rest.

/** Two views of the same page by the same person within this many minutes count once. */
export const VISIT_DEDUPE_MINUTES = 10

/** activity_events.source / event_type for a portal page view (hq migration 014: freeform). */
export const VISIT_SOURCE = 'portal'
export const VISIT_EVENT = 'page_view'

const MAX_PATH = 200
const SEGMENT = /^[a-z0-9._~-]+$/

/**
 * The page a visit is logged against, or null when it is not a portal page we log.
 * Only `/member` and below. The query and hash are dropped (a device code or a
 * filter is not where you were), the path is lowercased, repeated and trailing
 * slashes go. A segment with anything but plain URL characters is refused rather
 * than stored, so nothing odd lands in the table.
 */
export function normalizeVisitPath(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let path = input.split(/[?#]/, 1)[0] ?? ''
  try {
    path = decodeURIComponent(path)
  } catch {
    return null
  }
  path = path.toLowerCase().replace(/\/{2,}/g, '/')
  if (path.length > 1) path = path.replace(/\/+$/, '')
  if (path.length > MAX_PATH) return null
  if (path !== '/member' && !path.startsWith('/member/')) return null
  const segments = path.split('/').slice(1)
  return segments.every((s) => SEGMENT.test(s) && !/^\.+$/.test(s)) ? path : null
}

/**
 * The dedup key for activity_events (UNIQUE). A view inside the same 10-minute
 * bucket as an earlier one for the same person and page is the same row, so a
 * double request or a reload storm never doubles. The writer also skips a view
 * when there is one in the last VISIT_DEDUPE_MINUTES, across a bucket edge.
 */
export function visitDedupKey(personId: string, path: string, at: Date): string {
  const bucket = Math.floor(at.getTime() / (VISIT_DEDUPE_MINUTES * 60_000))
  return `portal:view:${personId}:${path}:${bucket}`
}

/** The pages of an offering, as logged: `/member/invest/<slug>` and below. */
export function offeringPagePrefix(slug: string): string {
  return `/member/invest/${slug.toLowerCase()}`
}

/**
 * Whether a logged page counts as a visit to the offering: its page and the pages
 * under it (the documents), but not the committee's own page (`/komite`).
 */
export function isOfferingVisit(path: string, slug: string): boolean {
  const base = offeringPagePrefix(slug)
  if (path === base) return true
  if (!path.startsWith(`${base}/`)) return false
  return !(path === `${base}/komite` || path.startsWith(`${base}/komite/`))
}
