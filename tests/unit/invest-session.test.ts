// The online info session sign-up's pure rules (server/utils/investSessions.ts). Run: npm run test:unit.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  answerShown,
  parseSessionNote,
  SESSION_NOTE_MAX,
  sessionSignupOpen,
} from '../../server/utils/investSessions.ts'

describe('sessionSignupOpen', () => {
  test('open to members while the offering is in interest or committing', () => {
    assert.equal(sessionSignupOpen('interest', false), true)
    assert.equal(sessionSignupOpen('committing', false), true)
  })
  test('a draft only for the committee preview', () => {
    assert.equal(sessionSignupOpen('draft', true), true)
    assert.equal(sessionSignupOpen('draft', false), false)
  })
  test('closed is closed, preview or not', () => {
    assert.equal(sessionSignupOpen('closed', false), false)
    assert.equal(sessionSignupOpen('closed', true), false)
  })
})

describe('parseSessionNote', () => {
  test('no note, or only spaces, is null', () => {
    assert.deepEqual(parseSessionNote({}), { note: null })
    assert.deepEqual(parseSessionNote(null), { note: null })
    assert.deepEqual(parseSessionNote({ note: null }), { note: null })
    assert.deepEqual(parseSessionNote({ note: '   \n ' }), { note: null })
  })
  test('trimmed', () => {
    assert.deepEqual(parseSessionNote({ note: '  tirsdag formiddag ' }), { note: 'tirsdag formiddag' })
  })
  test('at most 280 characters, counted as characters and not UTF-16 units', () => {
    assert.deepEqual(parseSessionNote({ note: 'x'.repeat(SESSION_NOTE_MAX) }), { note: 'x'.repeat(280) })
    assert.deepEqual(parseSessionNote({ note: 'x'.repeat(SESSION_NOTE_MAX + 1) }), {
      error: 'invest.session.errors.tooLong',
    })
    const emoji = '😅'.repeat(SESSION_NOTE_MAX)
    assert.deepEqual(parseSessionNote({ note: emoji }), { note: emoji })
  })
  test('anything but text is refused', () => {
    assert.deepEqual(parseSessionNote({ note: 42 }), { error: 'invest.session.errors.note' })
    assert.deepEqual(parseSessionNote({ note: ['a'] }), { error: 'invest.session.errors.note' })
  })
})

describe('answerShown', () => {
  test('no subscription row is not answered', () => {
    assert.equal(answerShown(null, null), null)
  })
  test('interest is yes or maybe, declined is no', () => {
    assert.equal(answerShown('interest', 'yes'), 'yes')
    assert.equal(answerShown('interest', null), 'yes')
    assert.equal(answerShown('interest', 'maybe'), 'maybe')
    assert.equal(answerShown('declined', null), 'no')
  })
  test('past interest is one label', () => {
    for (const phase of ['committed', 'signed', 'paid']) assert.equal(answerShown(phase, null), 'committed')
  })
})
