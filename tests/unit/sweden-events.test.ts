// Host and theme of a Stockholm evening for the public /sweden page
// (server/utils/swedenEvents.ts). Run: npm run test:unit.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { eventLabel } from '../../server/utils/swedenEvents.ts'

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
