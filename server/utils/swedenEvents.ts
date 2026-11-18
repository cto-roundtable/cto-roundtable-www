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
