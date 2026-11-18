// Host and theme of a Stockholm evening for the public /sweden page
// (server/utils/swedenEvents.ts). Run: npm run test:unit.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  ATTENDANCE_SHOWN_ABOVE_MEMBERS,
  eventLabel,
  publicEvenings,
  showAttendance,
} from '../../server/utils/swedenEvents.ts'

describe('eventLabel', () => {
  test('the Luma title names host and theme', () => {
    assert.deepEqual(
      eventLabel('CTO Roundtable Stockholm @ Endform: Agent setups', 'Endform, Magnus Ladulåsgatan 3, Stockholm'),
      { host: 'Endform', theme: 'Agent setups' },
    )
  })

  test('a theme with a colon of its own stays whole', () => {
    assert.deepEqual(eventLabel('CTO Roundtable Stockholm @ Acme: Evals: what works', null), {
      host: 'Acme',
      theme: 'Evals: what works',
    })
  })

  test('host without a theme', () => {
    assert.deepEqual(eventLabel('CTO Roundtable Stockholm @ Enlace Labs', 'Somewhere, Stockholm'), {
      host: 'Enlace Labs',
      theme: null,
    })
  })

  test('no "@": the host falls back to the location, the title after a colon is the theme', () => {
    assert.deepEqual(eventLabel('CTO Roundtable Stockholm: Platform teams', 'Acme AB, Sveavägen 1'), {
      host: 'Acme AB',
      theme: 'Platform teams',
    })
  })

  test('a bare chapter name is not a theme', () => {
    assert.deepEqual(eventLabel('CTO Roundtable Stockholm', 'Acme AB, Sveavägen 1'), { host: 'Acme AB', theme: null })
  })

  test('nothing known', () => {
    assert.deepEqual(eventLabel(null, null), { host: null, theme: null })
    assert.deepEqual(eventLabel('', ''), { host: null, theme: null })
  })
})

// Snorre on PR #111: no headcount until the chapter passes 11 members.
describe('attendance on the public page', () => {
  const rows = [
    {
      date: '2026-11-17',
      title: 'CTO Roundtable Stockholm @ Endform: Agent setups',
      location: 'Endform, Stockholm',
      ctos: 7,
    },
  ]

  test('the threshold is "more than 11 members"', () => {
    assert.equal(ATTENDANCE_SHOWN_ABOVE_MEMBERS, 11)
    assert.equal(showAttendance(0), false)
    assert.equal(showAttendance(10), false)
    assert.equal(showAttendance(11), false)
    assert.equal(showAttendance(12), true)
  })

  test('at 11 members or fewer an evening is date, host and theme, with no count at all', () => {
    for (const members of [0, 10, 11]) {
      const [e] = publicEvenings(rows, members)
      assert.deepEqual(e, { date: '2026-11-17', host: 'Endform', theme: 'Agent setups' })
      assert.equal('ctos' in e!, false)
    }
  })

  test('above 11 members the count comes along', () => {
    assert.deepEqual(publicEvenings(rows, 12), [
      { date: '2026-11-17', host: 'Endform', theme: 'Agent setups', ctos: 7 },
    ])
  })
})
