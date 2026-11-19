// Member admission votes (vedtekter § 4.1, counted by § 5.5): the pure rules in
// server/utils/admissionRules.ts, which reuse voteRules.ts rather than copy it.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  ADMISSION_ROSTER_GROUP,
  ADMISSION_RULES,
  closesAtFrom,
  countAdmission,
  DEFAULT_WINDOW_DAYS,
  isAdmissionStatus,
  joinRequestStatusAfter,
  MAX_WINDOW_DAYS,
  MIN_WINDOW_DAYS,
  voteState,
  windowDays,
} from '../../server/utils/admissionRules.ts'
import type { MeetingChoice } from '../../server/utils/voteRules.ts'

const roster = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`)
const ballots = (yes: number, no: number, blank: number): MeetingChoice[] => [
  ...Array(yes).fill('yes'),
  ...Array(no).fill('no'),
  ...Array(blank).fill('blank'),
]
function run(yes: number, no: number, blank: number, size = 40) {
  const r = roster(size)
  const b = ballots(yes, no, blank)
  return countAdmission(r, r.slice(0, b.length), b)
}

describe('the rule', () => {
  test('is § 5.5 majority of votes cast, blank not cast, secret ballot, tie by lot', () => {
    assert.equal(ADMISSION_RULES.preset, 'majority')
    assert.equal(ADMISSION_RULES.base, 'yes+no')
    assert.equal(ADMISSION_RULES.ballot, 'secret')
    assert.equal(ADMISSION_RULES.tie, 'lot')
    assert.equal(ADMISSION_RULES.strict, true)
  })
  test('the roster is the Norwegian forening', () => {
    assert.equal(ADMISSION_ROSTER_GROUP, 'cto-roundtable')
  })
})

describe('counting', () => {
  test('more yes than no passes', () => {
    assert.equal(run(6, 5, 0).decision.outcome, 'passed')
  })
  test('more no than yes fails', () => {
    assert.equal(run(5, 6, 0).decision.outcome, 'failed')
  })
  test('blank does not count as cast: 2 yes, 1 no, 10 blank passes', () => {
    const r = run(2, 1, 10)
    assert.equal(r.decision.outcome, 'passed')
    assert.equal(r.decision.base, 3)
    assert.equal(r.decision.needed, 2)
    assert.deepEqual([r.counts.yes, r.counts.no, r.counts.blank], [2, 1, 10])
  })
  test('yes = no is a tie for the lot', () => {
    assert.equal(run(4, 4, 3).decision.outcome, 'tie')
  })
  test('only blanks, or nobody, is no_votes', () => {
    assert.equal(run(0, 0, 5).decision.outcome, 'no_votes')
    assert.equal(run(0, 0, 0).decision.outcome, 'no_votes')
  })
  test('turnout is receipts over the roster, blanks included', () => {
    const r = run(3, 1, 2, 25)
    assert.equal(r.turnout, 6)
    assert.equal(r.rosterSize, 25)
  })
  test('a mismatch between receipts and choices is refused, not guessed', () => {
    assert.throws(() => countAdmission(roster(5), ['p0', 'p1'], ['yes']))
  })
  test('every yes/no split up to 40 agrees with "more than half of yes + no"', () => {
    for (let yes = 0; yes <= 40; yes++) {
      for (let no = 0; no <= 40 - yes; no++) {
        const out = run(yes, no, 0, 80).decision.outcome
        const want = yes + no === 0 ? 'no_votes' : yes === no ? 'tie' : 2 * yes > yes + no ? 'passed' : 'failed'
        assert.equal(out, want, `${yes} yes, ${no} no`)
      }
    }
  })
})

describe('what the application becomes', () => {
  test('passed -> accepted, failed or no_votes -> rejected', () => {
    assert.equal(joinRequestStatusAfter('passed', null), 'accepted')
    assert.equal(joinRequestStatusAfter('failed', null), 'rejected')
    assert.equal(joinRequestStatusAfter('no_votes', null), 'rejected')
  })
  test('a tie waits for the lot, then follows it', () => {
    assert.equal(joinRequestStatusAfter('tie', null), 'pending')
    assert.equal(joinRequestStatusAfter('tie', 'passed'), 'accepted')
    assert.equal(joinRequestStatusAfter('tie', 'failed'), 'rejected')
  })
  test('still running stays pending', () => {
    assert.equal(joinRequestStatusAfter(null, null), 'pending')
  })
})

describe('the window', () => {
  test('defaults to 7 days and is clamped', () => {
    assert.equal(DEFAULT_WINDOW_DAYS, 7)
    assert.equal(windowDays(undefined), 7)
    assert.equal(windowDays('abc'), 7)
    assert.equal(windowDays(2.5), 7)
    assert.equal(windowDays(3), 3)
    assert.equal(windowDays('14'), 14)
    assert.equal(windowDays(0), MIN_WINDOW_DAYS)
    assert.equal(windowDays(365), MAX_WINDOW_DAYS)
  })
  test('closes_at is opened + days', () => {
    const at = new Date('2026-11-19T17:00:00Z')
    assert.equal(closesAtFrom(at, 7).toISOString(), '2026-11-26T17:00:00.000Z')
  })
  test('state: open, due at the deadline, closed, cancelled', () => {
    const now = new Date('2026-11-20T12:00:00Z')
    const base = { closes_at: '2026-11-26T17:00:00Z', closed_at: null, cancelled_at: null }
    assert.equal(voteState(base, now), 'open')
    assert.equal(voteState({ ...base, closes_at: '2026-11-20T12:00:00Z' }, now), 'due')
    assert.equal(voteState({ ...base, closed_at: '2026-11-20T11:00:00Z' }, now), 'closed')
    assert.equal(voteState({ ...base, cancelled_at: '2026-11-20T11:00:00Z' }, now), 'cancelled')
  })
})

describe('admission status', () => {
  test('open or closed, nothing else', () => {
    assert.ok(isAdmissionStatus('open'))
    assert.ok(isAdmissionStatus('closed'))
    assert.ok(!isAdmissionStatus('paused'))
    assert.ok(!isAdmissionStatus(null))
  })
})
