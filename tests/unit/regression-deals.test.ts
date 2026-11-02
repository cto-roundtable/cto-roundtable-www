// Regression tests: the DEAL vote (server/utils/dealRounds.ts) is exactly as it
// was before the general meeting module (ctori-4 meeting-votes, Snorre's
// requirement 1). These pin today's rule, counting and hashing. Run: npm run test:unit.
// The diff guard that refused any branch touching a deal file was lifted by Snorre
// 2026-11-02 (ctori-4 dc-84 H2) once the meeting branches had landed.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { bundleSha256, countRound, ROUND_RULES, resultOf } from '../../server/utils/dealRounds.ts'
import { decide, rulesFor } from '../../server/utils/voteRules.ts'

const tally = (yes: number, no: number, blank = 0, defaultBlank = 0, notVoted = 0) => ({
  eligible: yes + no + blank + defaultBlank + notVoted,
  yes,
  no,
  blank,
  defaultBlank,
  notVoted,
  late: 0,
  turnout: 0,
})

describe('deal rule: unchanged', () => {
  test('ROUND_RULES is exactly the 2026-10-22 vote model (A+, 48 h, 2/3 of yes + no)', () => {
    assert.deepEqual(ROUND_RULES, {
      threshold: '2/3',
      base: 'yes+no',
      excluded: ['blank', 'none'],
      weighting: 'person',
      window_h: 48,
      ballot: 'choices_board_only',
      mandate: null,
    })
  })
  test('resultOf: 2/3 of yes + no, blanks and defaults ignored, nothing cast is no_quorum', () => {
    const cases: [number, number, number, number, string][] = [
      [2, 1, 0, 0, 'passed'],
      [3, 2, 0, 0, 'failed'],
      [4, 2, 9, 3, 'passed'],
      [2, 2, 0, 0, 'failed'],
      [0, 0, 5, 2, 'no_quorum'],
      [0, 1, 0, 0, 'failed'],
      [1, 0, 0, 0, 'passed'],
      [10, 5, 0, 0, 'passed'],
      [9, 5, 0, 0, 'failed'],
    ]
    for (const [yes, no, blank, def, want] of cases) {
      assert.equal(resultOf(tally(yes, no, blank, def)), want, `${yes}-${no} (+${blank} blank, ${def} default)`)
    }
  })
  test('the meeting core agrees with resultOf on every yes/no pair up to 60 (parity)', () => {
    const rules = rulesFor('two_thirds', 'yes+no', 'open')
    const map = { passed: 'passed', failed: 'failed', no_votes: 'no_quorum', tie: 'tie' } as const
    for (let yes = 0; yes <= 60; yes++) {
      for (let no = 0; no <= 60; no++) {
        for (const blank of [0, 3]) {
          const deal = resultOf(tally(yes, no, blank))
          const meeting = map[decide({ yes, no, blank, present: yes + no + blank }, rules).outcome]
          assert.equal(meeting, deal, `${yes}-${no}-${blank}`)
        }
      }
    }
  })
})

describe('deal counting: unchanged', () => {
  const roster = [
    { person_id: 'a', name: 'A', email: null, default_vote: null, conflict: false },
    { person_id: 'b', name: 'B', email: null, default_vote: 'blank' as const, conflict: false },
    { person_id: 'c', name: 'C', email: null, default_vote: null, conflict: false },
    { person_id: 'd', name: 'D', email: null, default_vote: null, conflict: false },
  ]
  const b = (person_id: string, choice: string) => ({
    person_id,
    choice,
    method: 'portal',
    cast_at: '2026-11-01T10:00:00Z',
    registered_by: null,
  })
  test('ballots, a standing blank, not voted and a late ballot', () => {
    const { tally: t, rows } = countRound(roster, [b('a', 'yes'), b('x', 'no')], [{ person_id: 'c' }])
    assert.deepEqual(t, { eligible: 4, yes: 1, no: 0, blank: 0, defaultBlank: 1, notVoted: 2, late: 1, turnout: 0.25 })
    assert.deepEqual(
      rows.map((r) => [r.member.person_id, r.counted, r.late]),
      [
        ['a', 'yes', false],
        ['b', 'default_blank', false],
        ['c', 'none', true],
        ['d', 'none', false],
      ],
    )
  })
  test('a cast blank beats the standing default and counts in turnout', () => {
    const { tally: t } = countRound(roster, [b('b', 'blank'), b('a', 'no')], [])
    assert.equal(t.blank, 1)
    assert.equal(t.defaultBlank, 0)
    assert.equal(t.turnout, 0.5)
  })
  test('bundleSha256 hashes exactly as before (pinned vector from main @ dc53b1c)', () => {
    const sha = bundleSha256(
      [
        { key: 'memo', title: 'Memo', version: 2, sha256: 'a'.repeat(64) },
        { key: 'deck', title: 'Deck', version: 1, sha256: 'b'.repeat(64) },
      ],
      { amount: 1500000, currency: 'NOK', instrument: 'SAFE', cap: null, termsSummary: null },
    )
    assert.equal(sha, '29ecd4fa073318b0bcecdcf3aec55612ce5f806671009af6e1d19485cba1ae5b')
  })
})
