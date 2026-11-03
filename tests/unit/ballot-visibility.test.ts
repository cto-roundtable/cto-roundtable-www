// Who sees what of a deal vote (komité 2026-11-03, ctori-4 item hide-votes): a voter
// never sees how anyone else voted while it runs, the committee sees who voted, not
// what, and it is ONE switch (ROUND_RULES.ballot). Run: npm run test:unit.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { ballotVisibility, countRound, countsShown, ROUND_RULES, turnoutOf } from '../../server/utils/dealRounds.ts'

const member = (id: string, default_vote: 'blank' | null = null) => ({
  person_id: id,
  name: id,
  email: null,
  default_vote,
  conflict: false,
})
const b = (id: string, choice: string) => ({
  person_id: id,
  choice,
  method: 'portal',
  cast_at: '',
  registered_by: null,
})

describe('the switch', () => {
  test('today: choices hidden, no live counts, no named choices', () => {
    assert.equal(ROUND_RULES.ballot, 'choices_hidden')
    assert.deepEqual(ballotVisibility(ROUND_RULES.ballot), { liveCounts: false, namedChoices: false })
  })
  test('opening it up again is the old rule: live counts, named choices to the committee', () => {
    assert.deepEqual(ballotVisibility('choices_board_only'), { liveCounts: true, namedChoices: true })
    assert.deepEqual(ballotVisibility('open'), { liveCounts: true, namedChoices: true }) // email era
  })
  test('a rule nobody knows is the strictest', () => {
    for (const r of [undefined, null, '', 'secret', 42]) {
      assert.deepEqual(ballotVisibility(r), { liveCounts: false, namedChoices: false }, String(r))
    }
  })
  test('the counts leave the server once closed, live only where the rule says', () => {
    const hidden = { ballot: 'choices_hidden' }
    assert.equal(countsShown({ status: 'open', rules: hidden }), false)
    assert.equal(countsShown({ status: 'draft', rules: hidden }), false)
    assert.equal(countsShown({ status: 'cancelled', rules: hidden }), false)
    assert.equal(countsShown({ status: 'closed', rules: hidden }), true)
    assert.equal(countsShown({ status: 'open', rules: { ballot: 'choices_board_only' } }), true)
    assert.equal(countsShown({ status: 'open', rules: null }), false)
  })
})

describe('turnout: how many, never how', () => {
  test('turnoutOf carries no choice', () => {
    const roster = [member('a'), member('b'), member('c', 'blank'), member('d')]
    const { tally } = countRound(roster, [b('a', 'no'), b('b', 'yes')], [])
    const t = turnoutOf(tally)
    assert.deepEqual(t, { eligible: 4, voted: 2, turnout: 0.5 })
    assert.deepEqual(Object.keys(t).sort(), ['eligible', 'turnout', 'voted'])
  })
  test('a yes and a no give the same turnout', () => {
    const roster = [member('a'), member('b')]
    const yes = turnoutOf(countRound(roster, [b('a', 'yes')], []).tally)
    const no = turnoutOf(countRound(roster, [b('a', 'no')], []).tally)
    assert.deepEqual(yes, no)
  })
})

describe('every exit asks the switch', () => {
  const src = readFileSync(new URL('../../server/utils/dealRounds.ts', import.meta.url), 'utf8')
  test('no route hands out tallyOf() directly: only withTally() and the server itself', () => {
    // tallyOf is the whole count. Outside its definition and withTally it is used only
    // for server-side work (the result mail after close).
    const uses = src.split('\n').filter((l) => /\btallyOf\(/.test(l) && !/function tallyOf/.test(l))
    assert.deepEqual(
      uses.map((l) => l.trim()),
      ['const t = await tallyOf(r)', 'const tally = await tallyOf(r)'],
    )
  })
  test('the named list and the admin ballots name a choice only through namedChoices', () => {
    assert.match(src, /\.\.\.\(namedChoices \? \{ choice: b\.choice \} : \{\}\)/)
    assert.match(src, /visibility\.namedChoices \|\| x\.counted === 'default_blank'/)
  })
})
