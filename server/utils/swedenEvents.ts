// The public /sweden page lists the evenings the Stockholm chapter has held:
// date, host company and theme. `events` has no host column (event_location_id
// is empty for the Luma imports), so they come from the Luma title, which is
// written "CTO Roundtable Stockholm @ <host>: <theme>", with the first part of
// `location` ("Endform, Magnus Ladulåsgatan 3, Stockholm") as the fallback for
// the host. Pure, so it is unit-tested (tests/unit/sweden-events.test.ts).

export interface EventLabel {
  host: string | null
  theme: string | null
}

export function eventLabel(title: string | null, location: string | null): EventLabel {
  const t = (title ?? '').trim()
  const at = t.match(/@\s*([^:]+?)\s*(?::\s*(.+))?$/)
  const fromLocation = (location ?? '').split(',')[0]?.trim() || null

  if (at) return { host: at[1]?.trim() || fromLocation, theme: at[2]?.trim() || null }

  // No "@ host": a title after a colon is the theme, a bare title is the theme itself
  // unless it is just the chapter's name.
  const colon = t.indexOf(':')
  const theme = colon >= 0 ? t.slice(colon + 1).trim() : t
  const generic = /^cto roundtable( stockholm| sweden)?$/i.test(theme)
  return { host: fromLocation, theme: theme && !generic ? theme : null }
}

// How many came to an evening is not shown while the chapter is small: the
// evenings are about a good conversation around the table, not a headcount.
// Snorre on PR #111 (2026-11-18): "We can start recording numbers when we pass
// 11 members." So the attendance number appears only when the Stockholm group
// has MORE than 11 members; below that it is left out of the public response.
export const ATTENDANCE_SHOWN_ABOVE_MEMBERS = 11

export const showAttendance = (members: number): boolean => members > ATTENDANCE_SHOWN_ABOVE_MEMBERS

export interface PublicEvening extends EventLabel {
  date: string
  /** Chapter CTOs at the evening. Present only when showAttendance(members). */
  ctos?: number
}

/** The evenings as the public page gets them: date, host, theme, and attendance only above the threshold. */
export function publicEvenings(
  rows: { date: string; title: string | null; location: string | null; ctos: number }[],
  members: number,
): PublicEvening[] {
  const withCount = showAttendance(members)
  return rows.map((r) => ({
    date: r.date,
    ...eventLabel(r.title, r.location),
    ...(withCount ? { ctos: r.ctos } : {}),
  }))
}
