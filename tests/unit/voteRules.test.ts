// Unit tests for the general meeting's counting rules (server/utils/voteRules.ts).
// Run: npm run test:unit (node --test, no database, no Nuxt).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  type CountBase,
  countOpenItem,
  countSecretItem,
  decide,
  finalOutcome,
  itemProtocolText,
  neededFor,
  type Preset,
  presentFrom,
  rulesFor,
} from '../../server/utils/voteRules.ts'

const r = (preset: Preset, base: CountBase = 'yes+no') => rulesFor(preset, base, 'open')
const at = (yes: number, no: number, blank = 0, present = yes + no + blank) => ({ yes, no, blank, present })
const outcome = (c: ReturnType<typeof at>, preset: Preset, base: CountBase = 'yes+no') =>
  decide(c, r(preset, base)).outcome

describe('majority (§ 5.5): more than half of the votes cast', () => {
  test('passes with more yes than no', () => assert.equal(outcome(at(3, 2), 'majority'), 'passed'))
  test('fails with more no than yes', () => assert.equal(outcome(at(2, 3), 'majority'), 'failed'))
  test('a single yes against nothing passes', () => assert.equal(outcome(at(1, 0), 'majority'), 'passed'))
  test('yes = no is a tie for the lot, never decided by the server', () => {
    assert.equal(outcome(at(2, 2), 'majority'), 'tie')
    assert.equal(outcome(at(1, 1, 5), 'majority'), 'tie')
  })
  test('blanks do not count as cast by default (dc-76 H1)', () => {
    assert.equal(outcome(at(3, 2, 10), 'majority'), 'passed')
    assert.equal(decide(at(3, 2, 10), r('majority')).base, 5)
  })
  test('with blanks counted as cast, yes must beat half of all three', () => {
    assert.equal(outcome(at(3, 2, 10), 'majority', 'yes+no+blank'), 'failed')
    assert.equal(outcome(at(8, 2, 5), 'majority', 'yes+no+blank'), 'passed')
    assert.equal(outcome(at(3, 3, 1), 'majority', 'yes+no+blank'), 'tie')
  })
  test('nobody voting yes or no decides nothing: no_votes, no lot', () => {
    assert.equal(outcome(at(0, 0), 'majority'), 'no_votes')
    assert.equal(outcome(at(0, 0, 4), 'majority'), 'no_votes')
  })
  test('all blank with blanks counted is a failed proposal, not a tie', () => {
    assert.equal(outcome(at(0, 0, 4), 'majority', 'yes+no+blank'), 'failed')
  })
  test('with blanks counted as cast, exactly half yes is not more than half: failed, not a tie', () => {
    assert.equal(outcome(at(2, 1, 1), 'majority', 'yes+no+blank'), 'failed')
    assert.equal(outcome(at(3, 1, 2), 'majority', 'yes+no+blank'), 'failed')
    assert.equal(outcome(at(3, 0, 2), 'majority', 'yes+no+blank'), 'passed')
  })
})

describe('two_thirds (§ 9): at least 2/3 of the votes cast', () => {
  test('exactly 2/3 passes', () => {
    assert.equal(outcome(at(2, 1), 'two_thirds'), 'passed')
    assert.equal(outcome(at(4, 2), 'two_thirds'), 'passed')
    assert.equal(outcome(at(20, 10), 'two_thirds'), 'passed')
  })
  test('just under 2/3 fails', () => {
    assert.equal(outcome(at(3, 2), 'two_thirds'), 'failed')
    assert.equal(outcome(at(5, 3), 'two_thirds'), 'failed')
    assert.equal(outcome(at(19, 10), 'two_thirds'), 'failed')
  })
  test('yes = no is a plain fail, not a tie', () => {
    assert.equal(outcome(at(2, 2), 'two_thirds'), 'failed')
    assert.equal(outcome(at(7, 7, 3), 'two_thirds'), 'failed')
  })
  test('blanks are left out of the base by default', () => {
    assert.equal(outcome(at(2, 1, 5), 'two_thirds'), 'passed')
    assert.equal(decide(at(2, 1, 5), r('two_thirds')).needed, 2)
  })
  test('blanks in the base can sink it', () => {
    assert.equal(outcome(at(2, 1, 5), 'two_thirds', 'yes+no+blank'), 'failed')
    assert.equal(decide(at(2, 1, 5), r('two_thirds', 'yes+no+blank')).needed, 6)
    assert.equal(outcome(at(6, 1, 2), 'two_thirds', 'yes+no+blank'), 'passed')
  })
  test('the 3 Dec sak 4 shape: 30 yes, 14 no, 4 blank of 48 present', () => {
    assert.equal(outcome(at(30, 14, 4, 48), 'two_thirds'), 'passed')
    assert.equal(outcome(at(29, 15, 4, 48), 'two_thirds'), 'failed')
  })
  test('only blanks: no_votes', () => assert.equal(outcome(at(0, 0, 3), 'two_thirds'), 'no_votes'))
})

describe('three_quarters (§ 10) and three_quarters_present (§ 5.2)', () => {
  test('3/4 of cast: exactly 3/4 passes, under fails', () => {
    assert.equal(outcome(at(3, 1), 'three_quarters'), 'passed')
    assert.equal(outcome(at(5, 2), 'three_quarters'), 'failed')
    assert.equal(outcome(at(2, 2), 'three_quarters'), 'failed')
  })
  test('3/4 of present counts everyone present, voters or not', () => {
    assert.equal(outcome(at(6, 0, 0, 8), 'three_quarters_present'), 'passed')
    assert.equal(outcome(at(5, 0, 0, 8), 'three_quarters_present'), 'failed')
    assert.equal(outcome(at(6, 2, 0, 8), 'three_quarters_present'), 'passed')
  })
  test('the counting base of the meeting does not change a present-based rule', () => {
    assert.equal(rulesFor('three_quarters_present', 'yes+no+blank', 'open').base, 'present')
  })
  test('nobody present: no_votes', () => assert.equal(outcome(at(0, 0, 0, 0), 'three_quarters_present'), 'no_votes'))
})

describe('the boundary, exhaustively', () => {
  for (const preset of ['majority', 'two_thirds', 'three_quarters'] as Preset[]) {
    test(`${preset}: needed yes passes and one fewer does not, for every base 1-80`, () => {
      for (let base = 1; base <= 80; base++) {
        const need = neededFor(base, preset) as number
        assert.ok(need >= 1 && need <= base, `${preset} base ${base}: needed ${need}`)
        assert.equal(outcome(at(need, base - need), preset), 'passed', `${preset} ${need}-${base - need}`)
        if (need > 0) {
          const below = outcome(at(need - 1, base - need + 1), preset)
          assert.ok(below === 'failed' || below === 'tie', `${preset} ${need - 1}-${base - need + 1}: ${below}`)
          if (below === 'tie') assert.equal(preset, 'majority')
        }
      }
    })
  }
  test('a base of 0 needs nothing: null, not 0 or 1', () => {
    for (const preset of ['majority', 'two_thirds', 'three_quarters', 'three_quarters_present'] as Preset[]) {
      assert.equal(neededFor(0, preset), null, preset)
    }
  })
  test('only majority can tie', () => {
    for (const preset of ['two_thirds', 'three_quarters', 'three_quarters_present'] as Preset[]) {
      for (let n = 1; n <= 40; n++) assert.notEqual(outcome(at(n, n), preset), 'tie')
    }
  })
})

describe('input validation', () => {
  test('negative or fractional counts are refused', () => {
    assert.throws(() => decide({ yes: -1, no: 0, blank: 0, present: 0 }, r('majority')))
    assert.throws(() => decide({ yes: 1.5, no: 0, blank: 0, present: 2 }, r('majority')))
  })
  test('rules snapshot is set by preset, never free-form', () => {
    assert.deepEqual(rulesFor('two_thirds', 'yes+no', 'secret'), {
      preset: 'two_thirds',
      threshold: '2/3',
      strict: false,
      base: 'yes+no',
      ballot: 'secret',
      tie: 'fails',
      paragraph: '§ 9',
    })
    assert.equal(rulesFor('majority', 'yes+no', 'open').tie, 'lot')
  })
})

describe('counting ballots', () => {
  const roster = ['a', 'b', 'c', 'd']
  test('open ballot: the latest ballot per person counts', () => {
    const { counts } = countOpenItem(
      roster,
      ['a', 'b', 'c'],
      [
        { person_id: 'a', choice: 'no', cast_at: '2027-03-10T18:00:00Z' },
        { person_id: 'a', choice: 'yes', cast_at: '2027-03-10T18:01:00Z' },
        { person_id: 'b', choice: 'blank', cast_at: '2027-03-10T18:00:30Z' },
      ],
    )
    assert.deepEqual(counts, { yes: 1, no: 0, blank: 1, present: 3 })
  })
  test('open ballot: a ballot from someone off the roster is ignored', () => {
    const { counts } = countOpenItem(roster, [], [{ person_id: 'x', choice: 'yes', cast_at: '2027-03-10T18:00:00Z' }])
    assert.deepEqual(counts, { yes: 0, no: 0, blank: 0, present: 0 })
  })
  test('a member who voted and then left still counts as cast and present for the sak', () => {
    const { counts, present } = countOpenItem(
      roster,
      ['b'],
      [{ person_id: 'a', choice: 'yes', cast_at: '2027-03-10T18:00:00Z' }],
    )
    assert.equal(counts.yes, 1)
    assert.equal(counts.present, 2)
    assert.deepEqual(present.sort(), ['a', 'b'])
  })
  test('secret ballot: counts choices, present includes the voters', () => {
    const { counts } = countSecretItem(roster, ['a', 'b'], ['a', 'c'], ['yes', 'no'])
    assert.deepEqual(counts, { yes: 1, no: 1, blank: 0, present: 3 })
  })
  test('secret ballot: choices and receipts must match, or the count is refused', () => {
    assert.throws(() => countSecretItem(roster, [], ['a'], ['yes', 'no']), /mismatch/)
  })
  test('attendance: the latest in/out row per person wins', () => {
    const ids = presentFrom([
      { person_id: 'a', present: true, at: '2027-03-10T17:00:00Z' },
      { person_id: 'a', present: false, at: '2027-03-10T19:00:00Z' },
      { person_id: 'b', present: false, at: '2027-03-10T17:00:00Z' },
      { person_id: 'b', present: true, at: '2027-03-10T17:30:00Z' },
      { person_id: 'c', present: true, at: '2027-03-10T17:10:00Z' },
    ])
    assert.deepEqual(ids.sort(), ['b', 'c'])
  })
})

describe('the tie and the protocol', () => {
  test('the lot decides a tie; nothing else is changed by a lot', () => {
    assert.equal(finalOutcome('tie', null), 'tie')
    assert.equal(finalOutcome('tie', 'passed'), 'passed')
    assert.equal(finalOutcome('tie', 'failed'), 'failed')
    assert.equal(finalOutcome('passed', null), 'passed')
  })
  test('the protocol names attendance, the count, the threshold and the result', () => {
    const counts = at(3, 2, 1, 7)
    const rules = r('two_thirds')
    const text = itemProtocolText({
      position: 4,
      title: 'Vedtektsendring § 4.2',
      rules,
      counts,
      decision: decide(counts, rules),
      presentNames: ['Ada', 'Bo'],
      ballot: 'secret',
      lot: null,
    })
    assert.match(text, /^Sak 4: Vedtektsendring § 4\.2/)
    assert.match(text, /Til stede: 7 \(Ada, Bo\)/)
    assert.match(text, /skriftlig og hemmelig/)
    assert.match(text, /Ja 3, nei 2, blankt 1\./)
    assert.match(text, /minst 2\/3 av de avgitte stemmene \(§ 9\)/)
    assert.match(text, /Blanke stemmer regnes ikke som avgitt\. Grunnlaget er 5 stemmer\. Det trengs minst 4 ja\./)
    assert.match(text, /Resultat: Ikke vedtatt\./)
    assert.doesNotMatch(text, /[–—]/)
  })
  test('a tie settled by lot says so, with who drew it and how', () => {
    const counts = at(5, 5, 0, 12)
    const rules = r('majority')
    const text = itemProtocolText({
      position: 2,
      title: 'Kontingent',
      rules,
      counts,
      decision: decide(counts, rules),
      presentNames: [],
      ballot: 'open',
      lot: { outcome: 'passed', note: 'mynt, kron = vedtatt', byName: 'Kari Møteleder' },
    })
    assert.match(
      text,
      /Stemmelikhet, avgjort ved loddtrekning \(mynt, kron = vedtatt, ført av Kari Møteleder\): vedtatt\./,
    )
  })
  test('one vote is "1 stemme", not "1 stemmer"', () => {
    const counts = at(1, 0)
    const text = itemProtocolText({
      position: 1,
      title: 'X',
      rules: r('majority'),
      counts,
      decision: decide(counts, r('majority')),
      presentNames: [],
      ballot: 'open',
      lot: null,
    })
    assert.match(text, /Grunnlaget er 1 stemme\./)
  })
  test('a tie with no lot yet says the lot is pending', () => {
    const counts = at(1, 1)
    const text = itemProtocolText({
      position: 1,
      title: 'X',
      rules: r('majority'),
      counts,
      decision: decide(counts, r('majority')),
      presentNames: [],
      ballot: 'open',
      lot: null,
    })
    assert.match(text, /Stemmelikhet, avgjøres ved loddtrekning/)
  })
})
