// Chapters of the network: Norway and the Swedish chapter. A chapter is not a
// column, it is membership of a group, so this file is the one place that maps
// between the two (decision sweden-portal-scope, members-portal project).
//
//   no = cto-roundtable      the Norwegian network, as it always was
//   se = roundtable-sweden   the Stockholm chapter, run separately (vedtak 6)
//
// A person can be in both (the Stockholm host is). A third chapter later is one
// line in CHAPTER_GROUPS. Rule that keeps the Norwegian lists right: never add a
// Swede to cto-roundtable; the public directory, the alle@ alias and the
// #roundtable sync all key on that group.

export type Chapter = 'no' | 'se'

export const CHAPTER_GROUPS: Record<Chapter, string> = {
  no: 'cto-roundtable',
  se: 'roundtable-sweden',
}

/** Every chapter group slug, for "member of any chapter" queries. */
export const CHAPTER_SLUGS: string[] = Object.values(CHAPTER_GROUPS)

const CHAPTER_BY_SLUG = Object.fromEntries(
  Object.entries(CHAPTER_GROUPS).map(([chapter, slug]) => [slug, chapter]),
) as Record<string, Chapter>

/** The chapter a group slug stands for, or null for a group that is not a chapter. */
export function chapterOfSlug(slug: string | null | undefined): Chapter | null {
  return slug ? (CHAPTER_BY_SLUG[slug] ?? null) : null
}

export function isChapter(value: unknown): value is Chapter {
  return typeof value === 'string' && value in CHAPTER_GROUPS
}

/** Group slugs for a set of chapters, for scoping queries (events, lists). */
export function chapterGroupSlugs(chapters: Chapter[]): string[] {
  return chapters.map((chapter) => CHAPTER_GROUPS[chapter])
}

/**
 * The chapters an ACTIVE person belongs to, Norway first. Empty when the person
 * is not active or in no chapter group: that is exactly "may not sign in", and
 * isPortalMember (server/utils/membership.ts) is defined on top of this.
 */
export async function getChapters(personId: string): Promise<Chapter[]> {
  const sql = useDatabase()
  const rows = await sql`
    SELECT DISTINCT ng.slug
    FROM persons p
    JOIN memberships m ON m.person_id = p.id
    JOIN network_groups ng ON ng.id = m.group_id
    WHERE p.id = ${personId}
      AND p.status = 'active'
      AND ng.slug = ANY(${CHAPTER_SLUGS})
  `
  const found = new Set(rows.map((r: any) => chapterOfSlug(r.slug)))
  return (Object.keys(CHAPTER_GROUPS) as Chapter[]).filter((chapter) => found.has(chapter))
}

/**
 * Member API routes that stay Norwegian for now: refused (403) to a session
 * without the `no` chapter by the /api/member/ middleware. AI onboarding wires
 * the shared Slack workspace and GitHub org, which vedtak 6 keeps Norwegian.
 * Board routes need no entry: they are gated on the styret group already.
 */
export const NORWAY_ONLY_API_PREFIXES = ['/api/member/onboarding']

export function isNorwayOnlyApi(pathname: string): boolean {
  return NORWAY_ONLY_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}.`),
  )
}
