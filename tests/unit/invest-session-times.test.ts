// Candidate times for the online session, Doodle style (server/utils/investSessionTimes.ts,
// hq migration 052, ctori-4 item session-times). The pure rules and the committee gate.
// Run: npm run test:unit.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  MEETING_URL_MAX,
  memberView,
  parseDuration,
  parseLocalStart,
  parseMeetingUrl,
  parsePicks,
  parseSessionTimeInput,
  requireSessionTimeManager,
  SESSION_DURATION_DEFAULT,
  SESSION_TIMES_MAX,
} from '../../server/utils/investSessionTimes.ts'

// Nitro's createError, as the routes see it: an Error carrying the status.
;(globalThis as any).createError = (o: { statusCode: number; message: string }) =>
  Object.assign(new Error(o.message), { statusCode: o.statusCode })

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

describe('parseLocalStart: Oslo wall time from <input type="datetime-local">', () => {
  test('a real date and time passes through', () => {
    assert.deepEqual(parseLocalStart('2026-12-03T19:00'), { startsAtLocal: '2026-12-03T19:00' })
    assert.deepEqual(parseLocalStart(' 2026-12-03T08:30 '), { startsAtLocal: '2026-12-03T08:30' })
  })
  test('not a date, a wrong shape, or a day that does not exist is refused', () => {
    for (const bad of [
      '',
      'i morgen',
      '2026-12-03',
      '2026-12-03 19:00',
      '2026-12-03T19:00:00',
      '2026-02-30T19:00',
      '2026-13-01T10:00',
      '2026-12-03T24:00',
      '2026-12-03T19:60',
      1764788400000,
      null,
      undefined,
    ])
      assert.deepEqual(parseLocalStart(bad), { error: 'invest.sessionTimes.errors.start' }, String(bad))
  })
  test('a year far outside reason is refused', () => {
    assert.ok('error' in parseLocalStart('1999-12-03T19:00'))
    assert.ok('error' in parseLocalStart('2101-12-03T19:00'))
    assert.ok(!('error' in parseLocalStart('2000-01-01T00:00')))
    assert.ok(!('error' in parseLocalStart('2100-12-31T23:59')))
  })
  test('29 February only in a leap year', () => {
    assert.ok(!('error' in parseLocalStart('2028-02-29T10:00')))
    assert.ok('error' in parseLocalStart('2027-02-29T10:00'))
  })
})

describe('parseDuration', () => {
  test('missing is an hour', () => {
    for (const v of [undefined, null, ''])
      assert.deepEqual(parseDuration(v), { durationMinutes: SESSION_DURATION_DEFAULT })
    assert.equal(SESSION_DURATION_DEFAULT, 60)
  })
  test('15 to 240 whole minutes, as a number or a string', () => {
    assert.deepEqual(parseDuration(15), { durationMinutes: 15 })
    assert.deepEqual(parseDuration(240), { durationMinutes: 240 })
    assert.deepEqual(parseDuration('45'), { durationMinutes: 45 })
  })
  test('outside the range, fractions and nonsense are refused', () => {
    for (const bad of [14, 241, 0, -60, 30.5, 'en time', true, {}])
      assert.deepEqual(parseDuration(bad), { error: 'invest.sessionTimes.errors.duration' }, String(bad))
  })
})

describe('parseMeetingUrl', () => {
  test('none is fine', () => {
    for (const v of [undefined, null, '', '   ']) assert.deepEqual(parseMeetingUrl(v), { meetingUrl: null })
  })
  test('an https Meet or Teams link passes, trimmed', () => {
    assert.deepEqual(parseMeetingUrl(' https://meet.google.com/abc-defg-hij '), {
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    })
    const teams = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=%7b%7d'
    assert.deepEqual(parseMeetingUrl(teams), { meetingUrl: teams })
  })
  test('http, javascript:, spaces, too long and not a string are refused', () => {
    const long = `https://x.no/${'a'.repeat(MEETING_URL_MAX)}`
    for (const bad of [
      'http://meet.google.com/x',
      'javascript:alert(1)',
      'https://meet google.com',
      'meet.google.com/x',
      'https://',
      long,
      42,
      {},
    ])
      assert.deepEqual(parseMeetingUrl(bad), { error: 'invest.sessionTimes.errors.url' }, String(bad).slice(0, 40))
  })
  test('exactly the maximum length passes', () => {
    const url = `https://x.no/${'a'.repeat(MEETING_URL_MAX - 'https://x.no/'.length)}`
    assert.equal(url.length, MEETING_URL_MAX)
    assert.deepEqual(parseMeetingUrl(url), { meetingUrl: url })
  })
})

describe('parseSessionTimeInput', () => {
  test('start, length and link together', () => {
    assert.deepEqual(
      parseSessionTimeInput({
        start: '2026-12-03T19:00',
        durationMinutes: 45,
        meetingUrl: 'https://meet.google.com/x',
      }),
      { startsAtLocal: '2026-12-03T19:00', durationMinutes: 45, meetingUrl: 'https://meet.google.com/x' },
    )
  })
  test('only a start is enough', () => {
    assert.deepEqual(parseSessionTimeInput({ start: '2026-12-03T19:00' }), {
      startsAtLocal: '2026-12-03T19:00',
      durationMinutes: 60,
      meetingUrl: null,
    })
  })
  test('the first problem is named', () => {
    assert.deepEqual(parseSessionTimeInput(null), { error: 'invest.sessionTimes.errors.start' })
    assert.deepEqual(parseSessionTimeInput({ start: '2026-12-03T19:00', durationMinutes: 5 }), {
      error: 'invest.sessionTimes.errors.duration',
    })
    assert.deepEqual(parseSessionTimeInput({ start: '2026-12-03T19:00', meetingUrl: 'http://x.no' }), {
      error: 'invest.sessionTimes.errors.url',
    })
  })
})

describe('parsePicks: the member ticks every time that works', () => {
  const candidates = [A, B]
  test('ticks of candidate times, duplicates once, case folded', () => {
    assert.deepEqual(parsePicks({ timeIds: [A, B, A.toUpperCase()] }, candidates, false), { timeIds: [A, B] })
  })
  test('ticking is how you sign up: none ticked is refused for someone not signed up', () => {
    assert.deepEqual(parsePicks({ timeIds: [] }, candidates, false), { error: 'invest.sessionTimes.errors.pickOne' })
  })
  test('someone signed up may untick everything (to leave, they undo the sign-up)', () => {
    assert.deepEqual(parsePicks({ timeIds: [] }, candidates, true), { timeIds: [] })
  })
  test('a time that is not one of this offering is "gone" (removed meanwhile, or another offering)', () => {
    assert.deepEqual(parsePicks({ timeIds: [A, C] }, candidates, true), { error: 'invest.sessionTimes.errors.gone' })
  })
  test('not a list, not ids, or too many is refused', () => {
    const many = Array.from({ length: SESSION_TIMES_MAX + 1 }, () => A)
    for (const bad of [null, {}, { timeIds: A }, { timeIds: ['x'] }, { timeIds: [1] }, { timeIds: many }])
      assert.deepEqual(
        parsePicks(bad, candidates, true),
        { error: 'invest.sessionTimes.errors.picks' },
        JSON.stringify(bad),
      )
  })
  test('exactly the maximum is fine', () => {
    const ids = Array.from(
      { length: SESSION_TIMES_MAX },
      (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
    )
    assert.deepEqual(parsePicks({ timeIds: ids }, ids, false), { timeIds: ids })
  })
})

describe('memberView: members see the link only on the chosen time', () => {
  test('the link of a candidate is hidden, of the chosen one shown', () => {
    const rows = [
      {
        id: A,
        startsAt: '2026-12-03T18:00:00.000Z',
        durationMinutes: 60,
        meetingUrl: 'https://meet.google.com/a',
        chosen: false,
      },
      {
        id: B,
        startsAt: '2026-12-04T18:00:00.000Z',
        durationMinutes: 45,
        meetingUrl: 'https://meet.google.com/b',
        chosen: true,
      },
    ]
    assert.deepEqual(memberView(rows), [
      { id: A, startsAt: '2026-12-03T18:00:00.000Z', durationMinutes: 60, chosen: false, meetingUrl: null },
      {
        id: B,
        startsAt: '2026-12-04T18:00:00.000Z',
        durationMinutes: 45,
        chosen: true,
        meetingUrl: 'https://meet.google.com/b',
      },
    ])
  })
})

describe('requireSessionTimeManager: the committee sets the times, nobody else', () => {
  const offering = { id: 'o-4', status: 'interest' }
  const gate = (committee: boolean, visible = true) => {
    const reads: string[] = []
    return {
      reads,
      deps: {
        requireVisibleOffering: async () => {
          reads.push('offering')
          if (!visible) throw (globalThis as any).createError({ statusCode: 404, message: 'Not found' })
          return { offering, preview: false }
        },
        isCommittee: async () => {
          reads.push('committee')
          return committee
        },
      },
    }
  }
  test('the committee gets the offering', async () => {
    const { deps } = gate(true)
    assert.deepEqual(await requireSessionTimeManager('p1', 'ctori-4', deps), { offering, preview: false })
  })
  test('a member, or the board alone, gets the 404 of a missing offering', async () => {
    const { deps } = gate(false)
    await assert.rejects(requireSessionTimeManager('p2', 'ctori-4', deps), { statusCode: 404 })
  })
  test('an offering the committee may not see is the same 404, before the committee is asked', async () => {
    const { deps, reads } = gate(true, false)
    await assert.rejects(requireSessionTimeManager('p1', 'ctori-9', deps), { statusCode: 404 })
    assert.deepEqual(reads, ['offering'])
  })
})
