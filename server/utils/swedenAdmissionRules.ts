/**
 * The rules of a Sweden admission vote (roundtable-sweden), as pure functions: no
 * database, no Nuxt, so they run under `node --test` (tests/unit/sweden-admission.test.ts).
 *
 * Snorre 2026-11-22, for Sweden only (Norway's § 4.1 vote, admissionRules.ts, is untouched):
 *   voters     an explicit list (admission_roles, hq 051): the founding members at the
 *              first Stockholm evening, 2026-11-17. Not "every member".
 *   managers   Snorre and Oliver (admission_roles 'manager'): they start a vote, close or
 *              cancel it, and are the only ones who read the notes.
 *   threshold  at least two-thirds yes: yes / (yes + no) >= 2/3 of the votes cast, blank
 *              not cast. voteRules preset 'two_thirds', so there is no tie and no lot.
 *   note       every ballot may carry a free-text note, stored on the anonymous half.
 *
 * The counting is voteRules.ts (the årsmøte's) and admissionRules.ts's window and
 * application rules, reused, not copied.
 */
import { countSecretItem, decide, type MeetingChoice, rulesFor } from './voteRules.ts'

/** The chapter group this is for. Never 'cto-roundtable': that stays § 4.1 (admission.ts). */
export const SWEDEN_ADMISSION_GROUP = 'roundtable-sweden'

/** At least 2/3 of yes + no, blank not cast, secret ballot. A 2/3 rule cannot tie. */
export const SWEDEN_ADMISSION_RULES = rulesFor('two_thirds', 'yes+no', 'secret')

/** The longest note a ballot may carry (hq 051 CHECK). */
export const NOTE_MAX = 2000

/**
 * A ballot's note: trimmed, empty is none. Too long is refused, never cut, so a voter
 * never has a note stored that is not the one they wrote.
 */
export function parseBallotNote(raw: unknown): { ok: true; note: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, note: null }
  if (typeof raw !== 'string') return { ok: false, error: 'note must be text' }
  const note = raw.trim()
  if (!note) return { ok: true, note: null }
  if (note.length > NOTE_MAX) return { ok: false, error: `The note is longer than ${NOTE_MAX} characters` }
  return { ok: true, note }
}

/**
 * Count a Sweden admission vote. `receiptIds` are who voted, `choices` the anonymous
 * ballots; a mismatch between the two is refused by countSecretItem.
 */
export function countSwedenAdmission(rosterIds: string[], receiptIds: string[], choices: MeetingChoice[]) {
  const { counts } = countSecretItem(rosterIds, [], receiptIds, choices)
  const decision = decide(counts, SWEDEN_ADMISSION_RULES)
  return { counts, decision, turnout: receiptIds.length, rosterSize: rosterIds.length }
}

/**
 * Who reads the notes, and when: a manager, once the vote is closed. Not while it runs:
 * a note says which way it is going, both managers are voters too, and nobody sees the
 * direction of a running vote (the same rule as the tally). Never another voter.
 */
export function notesVisible(viewer: { isManager: boolean }, state: 'open' | 'due' | 'closed' | 'cancelled'): boolean {
  return viewer.isManager && state === 'closed'
}
