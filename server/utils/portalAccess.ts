import { type Chapter, chaptersOfSlugs } from './chapter.ts'

// Who may hold a portal session, and how much of the portal they get. Pure, so
// tests/unit/portal-access.test.ts pins it; the database side is membership.ts.
//
//   member    an active person in a chapter group: the whole portal, as before.
//   investor  a pensjonist (status `retired`) in an SPV (a group with an invest_phase):
//             the invest part only (Snorre, 2026-11-06). Retiring gives up the network
//             (events, offers, surveys, the årsmøte vote), not the money already in an
//             SPV or a seat in the next one, and the deal votes and the CTORI signup
//             live in the portal. Jonas Dammen was locked out of both the day after
//             digital voting went live.
//   retired   any other pensjonist who was in a chapter: their own profile and an
//             application to become active again, which goes to the board (Snorre,
//             2026-11-06). An investor can apply the same way.
//
// Every level below `member` is enforced on the server (LEVEL_API_PREFIXES, in the
// /api/member/ middleware), deny by default. Hiding menu items is only UX.

export type PortalLevel = 'member' | 'investor' | 'retired'

export interface PortalAccess {
  level: PortalLevel
  /** The chapters the person is in. For `investor` this picks the language only:
   *  it never opens a chapter's pages (event.context.chapters stays empty). */
  chapters: Chapter[]
}

export interface GroupRef {
  slug: string
  investPhase: string | null
}

export function portalAccessOf(status: string, groups: GroupRef[]): PortalAccess | null {
  const chapters = chaptersOfSlugs(groups.map((g) => g.slug))
  if (status === 'active') return chapters.length ? { level: 'member', chapters } : null
  if (status !== 'retired') return null
  if (groups.some((g) => g.investPhase)) return { level: 'investor', chapters }
  return chapters.length ? { level: 'retired', chapters } : null
}

/** What every pensjonist may call: their own profile, and the application to come back. */
const RETIRED_API_PREFIXES = [
  '/api/member/info', // their own profile: status, groups, standing vote
  '/api/member/rejoin', // apply to become active again (the board decides)
]

/**
 * The member API each level below `member` may call. Everything else under
 * /api/member/ is 403. Committee and board actions under these prefixes are
 * gated on their own (isCommitteeMember / isBoardMember, which require `active`).
 */
export const LEVEL_API_PREFIXES: Record<Exclude<PortalLevel, 'member'>, string[]> = {
  retired: RETIRED_API_PREFIXES,
  investor: [
    ...RETIRED_API_PREFIXES,
    '/api/member/default-vote',
    '/api/member/deals', // cases and votes, the case gate decides which
    '/api/member/invest', // the CTORI offering
    '/api/member/updates', // investor updates, for companies their SPV funded
  ],
}

/** Whether a session at this level may call this /api/member/ path. */
export function levelMayCall(level: PortalLevel, pathname: string): boolean {
  if (level === 'member') return true
  return LEVEL_API_PREFIXES[level].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
