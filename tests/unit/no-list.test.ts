// The no list's search and filters (app/utils/noList.ts, /member/caser/nei). Run: npm run test:unit.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  categoryCounts,
  filterNoes,
  foldText,
  matchesNo,
  NO_CATEGORIES,
  type NoRow,
  yearsOf,
} from '../../app/utils/noList.ts'
import { DECLINE_CATEGORIES } from '../../server/utils/declineCategories.ts'

const row = (over: Partial<NoRow>): NoRow => ({
  slug: null,
  name: 'Acme',
  status: 'rejected',
  category: null,
  reason: null,
  decidedOn: '2024-05-01',
  decidedKnown: true,
  owner: null,
  coLeads: [],
  ...over,
})
const all = { q: '', year: '', category: '' }

const watchdog = row({
  name: 'Watchdog',
  category: 'ticket_size',
  reason: 'Billetten vår var for liten for runden.',
  decidedOn: '2026-10-02',
})
const cafe = row({ name: 'Café Ørn', category: 'not_a_fit', reason: 'For tidlig.', decidedOn: '2023-01-15' })
const heist = row({
  name: 'Heist',
  status: 'missed',
  category: null,
  reason: null,
  decidedOn: '2022-03-30',
  decidedKnown: false,
})
const rows = [watchdog, cafe, heist]

describe('the categories', () => {
  test('the page and the server name the same five, in the order hq 048 lists them', () => {
    assert.deepEqual([...NO_CATEGORIES], ['ticket_size', 'they_declined', 'missed_round', 'not_a_fit', 'company_dead'])
    assert.deepEqual([...NO_CATEGORIES], [...DECLINE_CATEGORIES])
  })
})

describe('search', () => {
  test('no filter keeps every row, in order', () => {
    assert.deepEqual(filterNoes(rows, all), rows)
    assert.deepEqual(filterNoes(rows, { ...all, q: '   ' }), rows)
  })
  test('in the name and the reason, any case, accents folded', () => {
    assert.deepEqual(filterNoes(rows, { ...all, q: 'WATCH' }), [watchdog])
    assert.deepEqual(filterNoes(rows, { ...all, q: 'billetten' }), [watchdog])
    assert.deepEqual(filterNoes(rows, { ...all, q: 'cafe' }), [cafe])
    assert.deepEqual(filterNoes(rows, { ...all, q: 'ørn' }), [cafe])
    assert.equal(foldText('Ørn É'), 'ørn e')
  })
  test('every word must match, anywhere in name or reason', () => {
    assert.deepEqual(filterNoes(rows, { ...all, q: 'watchdog runden' }), [watchdog])
    assert.deepEqual(filterNoes(rows, { ...all, q: 'watchdog tidlig' }), [])
  })
  test('a row without a reason is still found by name, and the word "null" finds nothing', () => {
    assert.deepEqual(filterNoes(rows, { ...all, q: 'heist' }), [heist])
    assert.deepEqual(filterNoes(rows, { ...all, q: 'null' }), [])
  })
  test('the owner is not searched', () => {
    assert.equal(matchesNo(row({ owner: 'Snorre' }), { ...all, q: 'snorre' }), false)
  })
})

describe('year and category', () => {
  test('a year keeps that year only', () => {
    assert.deepEqual(filterNoes(rows, { ...all, year: '2023' }), [cafe])
    assert.deepEqual(filterNoes(rows, { ...all, year: '2025' }), [])
  })
  test('a category keeps that category; "none" keeps the uncategorised', () => {
    assert.deepEqual(filterNoes(rows, { ...all, category: 'ticket_size' }), [watchdog])
    assert.deepEqual(filterNoes(rows, { ...all, category: 'none' }), [heist])
  })
  test('filters combine', () => {
    assert.deepEqual(filterNoes(rows, { q: 'runden', year: '2026', category: 'ticket_size' }), [watchdog])
    assert.deepEqual(filterNoes(rows, { q: 'runden', year: '2024', category: 'ticket_size' }), [])
    assert.deepEqual(filterNoes(rows, { q: '', year: '2026', category: 'not_a_fit' }), [])
  })
  test('years: each once, newest first', () => {
    assert.deepEqual(yearsOf([...rows, row({ decidedOn: '2023-12-31' })]), ['2026', '2023', '2022'])
    assert.deepEqual(yearsOf([]), [])
  })
  test('category counts: in the page order, the uncategorised last, empty ones left out', () => {
    assert.deepEqual(categoryCounts([...rows, row({ category: 'ticket_size' })]), [
      { key: 'ticket_size', count: 2 },
      { key: 'not_a_fit', count: 1 },
      { key: 'none', count: 1 },
    ])
    assert.deepEqual(categoryCounts([]), [])
  })
})
