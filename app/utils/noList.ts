// The no list (/member/caser/nei): search, year and category over the rows
// GET /api/member/deals/declined returns. Pure, so it is unit-tested
// (tests/unit/no-list.test.ts); the page filters in the browser, the list is small.

/** Why it ended (hq 048, pipeline_deals.decline_category), in the order the page offers them. */
export const NO_CATEGORIES = ['ticket_size', 'they_declined', 'missed_round', 'not_a_fit', 'company_dead'] as const
export type NoCategory = (typeof NO_CATEGORIES)[number]
/** The filter value for rows that have no category yet. */
export const NO_CATEGORY_NONE = 'none'

export interface NoRow {
  slug: string | null
  name: string
  status: string
  category: NoCategory | null
  reason: string | null
  /** YYYY-MM-DD */
  decidedOn: string
  decidedKnown: boolean
  owner: string | null
  coLeads: string[]
}

export interface NoFilter {
  /** free text: every word must be in the name or the reason */
  q: string
  /** 'YYYY', or '' for every year */
  year: string
  /** a category, NO_CATEGORY_NONE, or '' for every category */
  category: string
}

/** Lower case, accents off (é -> e), so "cafe" finds "Café". ø, æ and å stay letters. */
export function foldText(s: string): string {
  return s.toLocaleLowerCase('nb').normalize('NFD').replace(/\p{M}/gu, '')
}

export function yearOf(row: Pick<NoRow, 'decidedOn'>): string {
  return row.decidedOn.slice(0, 4)
}

export function matchesNo(row: NoRow, f: NoFilter): boolean {
  if (f.year && yearOf(row) !== f.year) return false
  if (f.category && (row.category ?? NO_CATEGORY_NONE) !== f.category) return false
  const words = foldText(f.q).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = foldText(`${row.name} ${row.reason ?? ''}`)
  return words.every((w) => hay.includes(w))
}

export function filterNoes(rows: NoRow[], f: NoFilter): NoRow[] {
  return rows.filter((r) => matchesNo(r, f))
}

/** The years that have a no, newest first. */
export function yearsOf(rows: NoRow[]): string[] {
  return [...new Set(rows.map(yearOf))].sort((a, b) => b.localeCompare(a))
}

/** How many rows each category has, in NO_CATEGORIES order, then the uncategorised; empty ones left out. */
export function categoryCounts(rows: NoRow[]): { key: string; count: number }[] {
  const keys: string[] = [...NO_CATEGORIES, NO_CATEGORY_NONE]
  return keys
    .map((key) => ({ key, count: rows.filter((r) => (r.category ?? NO_CATEGORY_NONE) === key).length }))
    .filter((c) => c.count > 0)
}
