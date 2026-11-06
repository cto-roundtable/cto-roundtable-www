// Who may sign in to the portal, and how much they get (server/utils/portalAccess.ts):
// an active person in a chapter is a member, a pensjonist in an SPV is an investor
// (the invest part only, Snorre 2026-11-06), anyone else stays out. Run: npm run test:unit.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { investorMayCall, portalAccessOf } from '../../server/utils/portalAccess.ts'

const no = { slug: 'cto-roundtable', investPhase: null }
const se = { slug: 'roundtable-sweden', investPhase: null }
const styret = { slug: 'styret', investPhase: null }
const komite = { slug: 'current-komite', investPhase: null }
const invest1 = { slug: 'invest-1', investPhase: 'completed' }
const invest3 = { slug: 'invest-3', investPhase: 'deploying' }

describe('portalAccessOf', () => {
  test('an active person in a chapter is a member, Norway first', () => {
    assert.deepEqual(portalAccessOf('active', [no]), { level: 'member', chapters: ['no'] })
    assert.deepEqual(portalAccessOf('active', [se, no, invest3]), { level: 'member', chapters: ['no', 'se'] })
    assert.deepEqual(portalAccessOf('active', [se]), { level: 'member', chapters: ['se'] })
  })

  test('an active person in no chapter stays out, whatever else they are in', () => {
    assert.equal(portalAccessOf('active', []), null)
    assert.equal(portalAccessOf('active', [invest3, styret, komite]), null)
  })

  test('a pensjonist in an SPV is an investor, at any phase of the SPV', () => {
    assert.deepEqual(portalAccessOf('retired', [no, invest3]), { level: 'investor', chapters: ['no'] })
    assert.deepEqual(portalAccessOf('retired', [no, invest1, { slug: 'ex-komite', investPhase: null }]), {
      level: 'investor',
      chapters: ['no'],
    })
    // Their chapter only picks the language; an SPV alone is enough.
    assert.deepEqual(portalAccessOf('retired', [invest3]), { level: 'investor', chapters: [] })
  })

  test('a pensjonist with board or committee groups left over is still only an investor', () => {
    assert.deepEqual(portalAccessOf('retired', [no, invest3, styret, komite]), { level: 'investor', chapters: ['no'] })
  })

  test('a pensjonist in no SPV stays out', () => {
    assert.equal(portalAccessOf('retired', [no]), null)
    assert.equal(portalAccessOf('retired', [no, styret]), null)
    assert.equal(portalAccessOf('retired', []), null)
  })

  test('any other status stays out, SPV or not', () => {
    for (const status of ['prospect', 'inactive', 'deleted', '']) {
      assert.equal(portalAccessOf(status, [no, invest3]), null, status)
    }
  })
})

describe('investorMayCall', () => {
  test('the invest part of the member API', () => {
    for (const path of [
      '/api/member/info',
      '/api/member/default-vote',
      '/api/member/deals',
      '/api/member/deals/open-votes',
      '/api/member/deals/acme/rounds/1/ballot',
      '/api/member/invest/current',
      '/api/member/invest/ctori-4',
      '/api/member/updates',
      '/api/member/updates/acme/1',
    ]) {
      assert.equal(investorMayCall(path), true, path)
    }
  })

  test('nothing else, and no prefix look-alikes', () => {
    for (const path of [
      '/api/member/chapter',
      '/api/member/surveys',
      '/api/member/discounts',
      '/api/member/onboarding',
      '/api/member/open-to-work/list',
      '/api/member/host/volunteer',
      '/api/member/meetings',
      '/api/member/board/members',
      '/api/member/committee/overview',
      '/api/member/activity/x',
      '/api/member/infox',
      '/api/member/dealsx',
      '/api/member/investor',
      '/api/member/updates-all',
      '/api/member/',
    ]) {
      assert.equal(investorMayCall(path), false, path)
    }
  })
})
