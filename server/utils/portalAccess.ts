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
//
// The investor level is enforced on the server (INVESTOR_API_PREFIXES, in the
// /api/member/ middleware), deny by default. Hiding menu items is only UX.

export type PortalLevel = 'member' | 'investor'

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
  if (status === 'retired' && groups.some((g) => g.investPhase)) return { level: 'investor', chapters }
  return null
}

/**
 * The member API an investor-only session may call. Everything else under
 * /api/member/ is 403. Committee and board actions under these prefixes are
 * gated on their own (isCommitteeMember / isBoardMember, which require `active`).
 */
export const INVESTOR_API_PREFIXES = [
  '/api/member/info', // their own profile: status, groups, standing vote
  '/api/member/default-vote',
  '/api/member/deals', // cases and votes, the case gate decides which
  '/api/member/invest', // the CTORI offering
  '/api/member/updates', // investor updates, for companies their SPV funded
]

export function investorMayCall(pathname: string): boolean {
  return INVESTOR_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}
