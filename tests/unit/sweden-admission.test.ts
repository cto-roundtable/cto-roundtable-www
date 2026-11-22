// Sweden admission votes (roundtable-sweden, Snorre 2026-11-22): the pure rules in
// server/utils/swedenAdmissionRules.ts, the separate switch, and the wall between the
// Sweden and Norway code. Norway's own rule stays pinned in admission.test.ts.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { ADMISSION_ROSTER_GROUP, ADMISSION_RULES } from '../../server/utils/admissionRules.ts'
import { admissionAccess } from '../../server/utils/admissionsFlag.ts'
import {
  countSwedenAdmission,
  NOTE_MAX,
  notesVisible,
  parseBallotNote,
  SWEDEN_ADMISSION_GROUP,
  SWEDEN_ADMISSION_RULES,
} from '../../server/utils/swedenAdmissionRules.ts'
import type { MeetingChoice } from '../../server/utils/voteRules.ts'

const roster = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`)
const ballots = (yes: number, no: number, blank: number): MeetingChoice[] => [
  ...Array(yes).fill('yes'),
  ...Array(no).fill('no'),
  ...Array(blank).fill('blank'),
]
function run(yes: number, no: number, blank: number, size = 6) {
  const r = roster(Math.max(size, yes + no + blank))
  const b = ballots(yes, no, blank)
  return countSwedenAdmission(r, r.slice(0, b.length), b)
}

describe('the rule', () => {
  test('is at least 2/3 of votes cast, blank not cast, secret, no tie', () => {
    assert.equal(SWEDEN_ADMISSION_RULES.preset, 'two_thirds')
    assert.equal(SWEDEN_ADMISSION_RULES.threshold, '2/3')
    assert.equal(SWEDEN_ADMISSION_RULES.strict, false)
    assert.equal(SWEDEN_ADMISSION_RULES.base, 'yes+no')
    assert.equal(SWEDEN_ADMISSION_RULES.ballot, 'secret')
    assert.equal(SWEDEN_ADMISSION_RULES.tie, 'fails')
  })
  test('is for roundtable-sweden, and Norway keeps its own group and majority', () => {
    assert.equal(SWEDEN_ADMISSION_GROUP, 'roundtable-sweden')
    assert.notEqual(SWEDEN_ADMISSION_GROUP, ADMISSION_ROSTER_GROUP)
    assert.equal(ADMISSION_ROSTER_GROUP, 'cto-roundtable')
    assert.equal(ADMISSION_RULES.preset, 'majority')
  })
})

describe('counting, with the six founding voters', () => {
  // [yes, no, blank, outcome, needed]
  const cases: [number, number, number, string, number | null][] = [
    [6, 0, 0, 'passed', 4],
    [4, 2, 0, 'passed', 4], // exactly 2/3 passes ("at least")
    [3, 2, 1, 'failed', 4], // 60 %
    [4, 1, 1, 'passed', 4],
    [2, 1, 3, 'passed', 2], // blanks are not cast: 2 of 3
    [1, 1, 0, 'failed', 2], // equal is not a tie here, it is below 2/3
    [3, 3, 0, 'failed', 4],
    [1, 0, 5, 'passed', 1], // no quorum today: one yes and five blanks pass (open question)
    [0, 0, 6, 'no_votes', null],
    [0, 0, 0, 'no_votes', null],
    [0, 6, 0, 'failed', 4],
  ]
  for (const [yes, no, blank, outcome, needed] of cases) {
    test(`${yes} yes, ${no} no, ${blank} blank: ${outcome}`, () => {
      const { counts, decision, turnout } = run(yes, no, blank)
      assert.deepEqual([counts.yes, counts.no, counts.blank], [yes, no, blank])
      assert.equal(decision.outcome, outcome)
      assert.equal(decision.needed, needed)
      assert.equal(turnout, yes + no + blank)
    })
  }
  test('two-thirds, not 66 %: 33 yes and 17 no (66.0 %) fails, 34 and 17 passes', () => {
    assert.equal(run(33, 17, 0, 50).decision.outcome, 'failed')
    assert.equal(run(34, 17, 0, 51).decision.outcome, 'passed')
  })
  test('never a tie, at any size up to 60', () => {
    for (let yes = 0; yes <= 30; yes++)
      for (let no = 0; no <= 30; no++) {
        const { decision } = run(yes, no, 0, 60)
        assert.notEqual(decision.outcome, 'tie')
        if (yes + no > 0) assert.equal(decision.outcome === 'passed', 3 * yes >= 2 * (yes + no), `${yes}/${no}`)
      }
  })
  test('a mismatch between receipts and choices is refused, not guessed', () => {
    assert.throws(() => countSwedenAdmission(roster(6), ['p0', 'p1'], ballots(1, 0, 0)))
  })
})

describe('the note', () => {
  test('none, empty or whitespace is no note', () => {
    for (const v of [undefined, null, '', '   ', '\n\t']) assert.deepEqual(parseBallotNote(v), { ok: true, note: null })
  })
  test('trimmed, and kept as written', () => {
    assert.deepEqual(parseBallotNote('  Strong CTO, met him at Epicenter.  '), {
      ok: true,
      note: 'Strong CTO, met him at Epicenter.',
    })
    assert.deepEqual(parseBallotNote('x'.repeat(NOTE_MAX)), { ok: true, note: 'x'.repeat(NOTE_MAX) })
  })
  test('too long or not text is refused, never cut', () => {
    assert.equal(NOTE_MAX, 2000)
    assert.equal(parseBallotNote('x'.repeat(NOTE_MAX + 1)).ok, false)
    for (const v of [42, true, {}, ['a']]) assert.equal(parseBallotNote(v).ok, false, JSON.stringify(v))
  })
  test('only a manager reads notes, and only once the vote is closed', () => {
    assert.equal(notesVisible({ isManager: true }, 'closed'), true)
    for (const s of ['open', 'due', 'cancelled'] as const) assert.equal(notesVisible({ isManager: true }, s), false, s)
    for (const s of ['open', 'due', 'closed', 'cancelled'] as const)
      assert.equal(notesVisible({ isManager: false }, s), false, s)
  })
})

describe('the Sweden switch', () => {
  test('nuxt.config reads it from its own env var, with no default', () => {
    const cfg = readFileSync('nuxt.config.ts', 'utf8')
    assert.match(cfg, /admissionsSwedenEnabled: process\.env\.NUXT_ADMISSIONS_SWEDEN_ENABLED \|\| ''/)
    assert.match(cfg, /admissionsEnabled: process\.env\.NUXT_ADMISSIONS_ENABLED \|\| ''/)
  })
  test('the policy: off, a manager may read and manage, never start or vote; others 404', () => {
    // requireSwedenAdmissions(isManager, action) is admissionAccess with a manager for styret.
    assert.equal(admissionAccess(false, true, 'read'), 200)
    assert.equal(admissionAccess(false, true, 'manage'), 200)
    assert.equal(admissionAccess(false, true, 'act'), 409)
    for (const a of ['read', 'act', 'manage'] as const) assert.equal(admissionAccess(false, false, a), 404)
  })
  test('each flag reads only its own config key', () => {
    const src = readFileSync('server/utils/admissionsFlag.ts', 'utf8')
    const sweden = src.slice(src.indexOf('export function swedenAdmissionsEnabled'))
    const norway = src.slice(
      src.indexOf('export function admissionsEnabled'),
      src.indexOf('export type AdmissionAction'),
    )
    assert.match(sweden, /useRuntimeConfig\(\)\.admissionsSwedenEnabled/)
    assert.doesNotMatch(norway, /Sweden/)
  })
})

describe('the wall between Sweden and Norway', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]))
  const sweden = files('server/api/member/sweden/admission')
  const norway = files('server/api/member/admission')
  test('there are routes on both sides', () => assert.ok(sweden.length >= 6 && norway.length >= 8))
  for (const r of sweden) {
    test(`${r} asks Sweden's gate, never Norway's`, () => {
      const src = readFileSync(r, 'utf8')
      assert.match(src, /requireSwedenAdmissions\(v\.isManager, '(read|act|manage)'\)/)
      assert.doesNotMatch(src, /requireAdmissions\(|admissionViewer\(/)
      if (/votes\.post|ballot\.post/.test(r)) assert.match(src, /requireSwedenAdmissions\(v\.isManager, 'act'\)/)
    })
  }
  for (const r of norway) {
    test(`${r} never asks Sweden's gate`, () => {
      assert.doesNotMatch(readFileSync(r, 'utf8'), /Sweden/)
    })
  }
  test('every admission_votes query in each util is scoped to its own roster group', () => {
    for (const [file, scope] of [
      ['server/utils/admission.ts', /roster_group = \$\{ADMISSION_ROSTER_GROUP\}/],
      ['server/utils/swedenAdmission.ts', /roster_group = \$\{GROUP\}/],
    ] as const) {
      const src = readFileSync(file, 'utf8')
      // Each SQL template that reads or changes admission_votes (not an INSERT, not a
      // subquery that only checks a row by id) names the roster group.
      const templates = src
        .split('sql`')
        .slice(1)
        .map((s) => s.slice(0, s.indexOf('`')))
      const touching = templates.filter(
        (q) => /(FROM|UPDATE|JOIN) admission_votes/.test(q) && !/INSERT INTO admission_votes/.test(q),
      )
      assert.ok(touching.length >= 6, `${file}: ${touching.length}`)
      for (const q of touching) {
        if (/^\s*UPDATE join_requests/.test(q)) continue // follows a vote this file already scoped
        assert.match(q, scope, `${file}:\n${q}`)
      }
    }
  })
  test('the Sweden ballot writes its note; Norway never does', () => {
    assert.match(
      readFileSync('server/utils/swedenAdmission.ts', 'utf8'),
      /INSERT INTO admission_secret_ballots \(vote_id, choice, note\)/,
    )
    assert.match(
      readFileSync('server/utils/admission.ts', 'utf8'),
      /INSERT INTO admission_secret_ballots \(vote_id, choice\) VALUES/,
    )
  })
})
