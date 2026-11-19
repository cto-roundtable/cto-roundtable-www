/**
 * The rules of a member admission vote (vedtekter § 4.1), as pure functions: no
 * database, no Nuxt, so they run under `node --test` (tests/unit/admission.test.ts).
 *
 * § 4.1  "Nye medlemmer vurderes av styret og godkjennes gjennom en avstemning
 *         blant eksisterende medlemmer."            -> the board starts it, members vote
 * § 5.5  simple majority of the votes cast, a tie by lots -> voteRules preset 'majority'
 * dc-76  a blank is not a vote cast                  -> count base 'yes+no'
 *
 * The counting itself is voteRules.ts (the årsmøte's), reused, not copied: an
 * admission is one secret yes/no/blank item with the majority preset.
 */
import { countSecretItem, decide, finalOutcome, type MeetingChoice, type Outcome, rulesFor } from './voteRules.ts'

/** The rule of every admission vote: § 5.5 majority of votes cast, blank not cast, secret ballot. */
export const ADMISSION_RULES = rulesFor('majority', 'yes+no', 'secret')

/** The window the board gets by default, and the bounds it may pick from. */
export const DEFAULT_WINDOW_DAYS = 7
export const MIN_WINDOW_DAYS = 1
export const MAX_WINDOW_DAYS = 21

/** Only the Norwegian forening admits by member vote (§ 4.1); its roster is the active members of this group. */
export const ADMISSION_ROSTER_GROUP = 'cto-roundtable'

export type AdmissionStatus = 'open' | 'closed'
export const ADMISSION_STATUSES: AdmissionStatus[] = ['open', 'closed']
export function isAdmissionStatus(v: unknown): v is AdmissionStatus {
  return typeof v === 'string' && (ADMISSION_STATUSES as string[]).includes(v)
}

/** A whole number of days within the bounds, else the default. */
export function windowDays(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN
  if (!Number.isInteger(n)) return DEFAULT_WINDOW_DAYS
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, n))
}

export function closesAtFrom(openedAt: Date, days: number): Date {
  return new Date(openedAt.getTime() + days * 24 * 60 * 60 * 1000)
}

export type VoteState = 'open' | 'due' | 'closed' | 'cancelled'

/** Where a vote stands at `now`: 'due' is past its window but not yet counted. */
export function voteState(
  v: { closes_at: string | Date; closed_at: string | Date | null; cancelled_at: string | Date | null },
  now: Date,
): VoteState {
  if (v.cancelled_at) return 'cancelled'
  if (v.closed_at) return 'closed'
  return new Date(v.closes_at).getTime() <= now.getTime() ? 'due' : 'open'
}

/**
 * Count an admission vote. `receiptIds` are the people who voted, `choices` the
 * anonymous ballots; ballots off the frozen roster cannot exist (the portal checks
 * the roster before it writes), and a mismatch is refused by countSecretItem.
 */
export function countAdmission(rosterIds: string[], receiptIds: string[], choices: MeetingChoice[]) {
  const { counts } = countSecretItem(rosterIds, [], receiptIds, choices)
  const decision = decide(counts, ADMISSION_RULES)
  return { counts, decision, turnout: receiptIds.length, rosterSize: rosterIds.length }
}

/**
 * What the application becomes once the vote stands. passed -> accepted, failed or
 * no_votes -> rejected, a tie with no lot yet -> still pending (the board draws, § 5.5).
 * Accepted does NOT create the membership: that stays the board's add-new-member step.
 */
export function joinRequestStatusAfter(
  result: Outcome | null,
  lot: 'passed' | 'failed' | null,
): 'accepted' | 'rejected' | 'pending' {
  const final = finalOutcome(result, lot)
  if (final === 'passed') return 'accepted'
  if (final === 'failed' || final === 'no_votes') return 'rejected'
  return 'pending'
}
