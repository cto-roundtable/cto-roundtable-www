// The portal visit log (server/utils/portalVisitRules.ts, portalVisits.ts): which pages
// are logged and as what, the 10-minute dedupe key, what counts as a visit to an
// offering, and that the read is the committee's alone. Run: npm run test:unit.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import {
  isOfferingVisit,
  normalizeVisitPath,
  offeringPagePrefix,
  VISIT_DEDUPE_MINUTES,
  visitDedupKey,
} from '../../server/utils/portalVisitRules.ts'

describe('normalizeVisitPath', () => {
  test('a portal page is logged as its path', () => {
    assert.equal(normalizeVisitPath('/member'), '/member')
    assert.equal(normalizeVisitPath('/member/invest/ctori-4'), '/member/invest/ctori-4')
    assert.equal(normalizeVisitPath('/member/invest/ctori-4/dokument/deck'), '/member/invest/ctori-4/dokument/deck')
  })

  test('query, hash, case, repeated and trailing slashes do not make a new page', () => {
    assert.equal(normalizeVisitPath('/member/invest/ctori-4?x=1#top'), '/member/invest/ctori-4')
    assert.equal(normalizeVisitPath('/member/device?code=ABCD-EFGH'), '/member/device')
    assert.equal(normalizeVisitPath('/Member/Invest/CTORI-4/'), '/member/invest/ctori-4')
    assert.equal(normalizeVisitPath('//member//invest///ctori-4'), '/member/invest/ctori-4')
    assert.equal(normalizeVisitPath('/member/'), '/member')
    assert.equal(normalizeVisitPath('/member/%63aser'), '/member/caser')
  })

  test('anything outside /member is not logged', () => {
    for (const p of ['/', '/privacy', '/members', '/memberx', '/api/member/info', 'member', '', '/sweden']) {
      assert.equal(normalizeVisitPath(p), null, p)
    }
  })

  test('odd input is refused, not stored', () => {
    for (const p of [
      undefined,
      null,
      42,
      {},
      ['/member'],
      '/member/<script>',
      '/member/a b',
      '/member/%ZZ',
      '/member/%2e%2e/x y',
      '/member/../board',
      '/member/.',
      `/member/${'a'.repeat(200)}`,
    ]) {
      assert.equal(normalizeVisitPath(p), null, String(p))
    }
  })

  test('at most 200 characters', () => {
    const ok = `/member/${'a'.repeat(192)}`
    assert.equal(ok.length, 200)
    assert.equal(normalizeVisitPath(ok), ok)
    assert.equal(normalizeVisitPath(`${ok}a`), null)
  })
})

describe('visitDedupKey', () => {
  const at = new Date('2026-11-25T10:00:00Z')
  const later = (min: number) => new Date(at.getTime() + min * 60_000)

  test('is 10 minutes', () => {
    assert.equal(VISIT_DEDUPE_MINUTES, 10)
  })

  test('the same person and page inside one bucket is one key', () => {
    assert.equal(visitDedupKey('p1', '/member', at), visitDedupKey('p1', '/member', later(9.99)))
  })

  test('the next bucket, another page or another person is a new key', () => {
    assert.notEqual(visitDedupKey('p1', '/member', at), visitDedupKey('p1', '/member', later(10)))
    assert.notEqual(visitDedupKey('p1', '/member', at), visitDedupKey('p1', '/member/caser', at))
    assert.notEqual(visitDedupKey('p1', '/member', at), visitDedupKey('p2', '/member', at))
  })

  test('names its source, so it never meets a Slack or Luma key', () => {
    assert.match(visitDedupKey('p1', '/member', at), /^portal:view:p1:\/member:\d+$/)
  })
})

describe('isOfferingVisit', () => {
  test('the offering page and its documents count', () => {
    assert.equal(offeringPagePrefix('CTORI-4'), '/member/invest/ctori-4')
    assert.equal(isOfferingVisit('/member/invest/ctori-4', 'ctori-4'), true)
    assert.equal(isOfferingVisit('/member/invest/ctori-4/dokument/deck', 'ctori-4'), true)
  })

  test('the committee page, another offering or another page does not', () => {
    assert.equal(isOfferingVisit('/member/invest/ctori-4/komite', 'ctori-4'), false)
    assert.equal(isOfferingVisit('/member/invest/ctori-4/komite/x', 'ctori-4'), false)
    assert.equal(isOfferingVisit('/member/invest/ctori-40', 'ctori-4'), false)
    assert.equal(isOfferingVisit('/member/invest/ctori-3', 'ctori-4'), false)
    assert.equal(isOfferingVisit('/member/invest', 'ctori-4'), false)
    assert.equal(isOfferingVisit('/member', 'ctori-4'), false)
  })
})

// The SQL is checked on the e2e branch; these pin the shape that keeps it safe.
describe('portalVisits.ts and its routes', () => {
  const util = readFileSync(new URL('../../server/utils/portalVisits.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../../server/api/member/invest/[slug]/visits.get.ts', import.meta.url), 'utf8')
  const write = readFileSync(new URL('../../server/api/member/visit.post.ts', import.meta.url), 'utf8')
  const board = readFileSync(new URL('../../server/api/member/board/activity.get.ts', import.meta.url), 'utf8')

  test('the offering read checks the committee before it reads anything', () => {
    const fn = util.slice(util.indexOf('export async function getOfferingVisits'))
    const gate = fn.indexOf('isCommitteeMember(personId)')
    const read = fn.indexOf('listOfferingVisits(')
    assert.ok(gate > 0 && read > gate)
    assert.match(fn, /statusCode: 404/)
    assert.match(route, /getOfferingVisits\(personId,/)
    assert.doesNotMatch(route, /listOfferingVisits|useDatabase/)
  })

  test('the writer takes the person from the session and names it as the actor', () => {
    assert.match(write, /event\.context\.session/)
    assert.match(write, /normalizeVisitPath\(body\?\.path\)/)
    assert.match(util, /setActor\(sql, `portal:\$\{personId\}`\)/)
    assert.match(util, /ON CONFLICT \(dedup_key\) DO NOTHING/)
  })

  test('the board report keeps portal views out of score and "sist sett"', () => {
    assert.equal((board.match(/source <> \$\{VISIT_SOURCE\}/g) ?? []).length, 2)
  })
})
