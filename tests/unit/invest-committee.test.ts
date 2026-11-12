// The CTORI committee page (server/utils/investCommittee.ts) and the interest form's
// wants_info rule (server/utils/invest.ts). Run: npm run test:unit.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { parseInterestInput, parseWantsInfo } from '../../server/utils/invest.ts'
import { getCommitteePage, interestTotals } from '../../server/utils/investCommittee.ts'

// Nitro's createError, as the routes see it: an Error carrying the status.
;(globalThis as any).createError = (o: { statusCode: number; message: string }) =>
  Object.assign(new Error(o.message), { statusCode: o.statusCode })

const OFFERING = { id: 'o-4', slug: 'ctori-4', name: 'CTORI 4', status: 'interest' }
const SIGNUP = { name: 'Kari', email: 'kari@x.no', signedUpAt: '2026-11-12', note: null, answer: null }

/** Deps that record what was read, so a refused caller can be shown to read nothing. */
function deps(opts: { committee: boolean; visible?: boolean }) {
  const reads: string[] = []
  return {
    reads,
    d: {
      requireVisibleOffering: async () => {
        reads.push('offering')
        if (opts.visible === false) throw (globalThis as any).createError({ statusCode: 404, message: 'Not found' })
        return { offering: OFFERING, preview: false }
      },
      isCommittee: async () => opts.committee,
      listSessionSignups: async () => {
        reads.push('signups')
        return [SIGNUP]
      },
      listInterestAnswers: async () => {
        reads.push('answers')
        return { rows: [], totals: { yes: 0, yesNok: 0, maybe: 0, no: 0 } }
      },
    },
  }
}

describe('getCommitteePage: the gate', () => {
  test('the committee gets the sign-ups and the answers', async () => {
    const { d } = deps({ committee: true })
    const page = await getCommitteePage('p1', 'ctori-4', d)
    assert.deepEqual(page.offering, { slug: 'ctori-4', name: 'CTORI 4', status: 'interest' })
    assert.deepEqual(page.sessionSignups, [SIGNUP])
    assert.deepEqual(page.totals, { yes: 0, yesNok: 0, maybe: 0, no: 0 })
  })
  test('anyone off the committee (a member, the board alone) gets a 404 and nothing is read', async () => {
    const { d, reads } = deps({ committee: false })
    await assert.rejects(getCommitteePage('p2', 'ctori-4', d), { statusCode: 404 })
    assert.deepEqual(reads, ['offering'])
  })
  test('an offering the committee may not see is the same 404', async () => {
    const { d, reads } = deps({ committee: true, visible: false })
    await assert.rejects(getCommitteePage('p1', 'ctori-9', d), { statusCode: 404 })
    assert.deepEqual(reads, ['offering'])
  })
})

describe('interestTotals: the numbers `invest-offering.mjs show` prints', () => {
  test('yes count and sum, maybe, declined', () => {
    const t = interestTotals([
      { phase: 'interest', interestLevel: 'yes', amountNok: 100_000 },
      { phase: 'interest', interestLevel: 'yes', amountNok: 300_000 },
      { phase: 'interest', interestLevel: 'maybe', amountNok: 50_000 },
      { phase: 'declined', interestLevel: null, amountNok: null },
    ])
    assert.deepEqual(t, { yes: 2, yesNok: 400_000, maybe: 1, no: 1 })
  })
  test('a row past interest (committed, signed, paid) counts in none of them', () => {
    const t = interestTotals([
      { phase: 'committed', interestLevel: 'yes', amountNok: 200_000 },
      { phase: 'paid', interestLevel: 'yes', amountNok: 200_000 },
    ])
    assert.deepEqual(t, { yes: 0, yesNok: 0, maybe: 0, no: 0 })
  })
  test('a yes without an amount counts, and adds nothing to the sum; interest with no level is neither', () => {
    const t = interestTotals([
      { phase: 'interest', interestLevel: 'yes', amountNok: null },
      { phase: 'interest', interestLevel: null, amountNok: 100_000 },
    ])
    assert.deepEqual(t, { yes: 1, yesNok: 0, maybe: 0, no: 0 })
  })
})

describe('the form payload: wants_info is left as it is', () => {
  const offering = {
    id: 'o-4',
    slug: 'ctori-4',
    name: 'CTORI 4',
    status: 'interest' as const,
    amountOptions: [50_000, 100_000, 200_000, 300_000],
    amountMin: 50_000,
    amountStep: 10_000,
    minNok: 1_500_000,
    interestClosesAt: null,
  }
  test('no wantsInfo in the body: null, for yes, maybe and no alike', () => {
    for (const answer of ['yes', 'maybe', 'no']) {
      const input = parseInterestInput(offering, { answer, amountNok: answer === 'yes' ? 100_000 : null })
      assert.equal(input.wantsInfo, null, answer)
    }
  })
  test('maybe no longer implies wants_info', () => {
    assert.equal(parseInterestInput(offering, { answer: 'maybe' }).wantsInfo, null)
  })
  test('an explicit boolean from an older page is still written', () => {
    assert.equal(parseInterestInput(offering, { answer: 'yes', amountNok: 50_000, wantsInfo: true }).wantsInfo, true)
    assert.equal(parseInterestInput(offering, { answer: 'yes', amountNok: 50_000, wantsInfo: false }).wantsInfo, false)
  })
  test('anything but a boolean is ignored', () => {
    for (const v of [undefined, null, 'true', 1, 0, {}]) assert.equal(parseWantsInfo({ wantsInfo: v }), null, String(v))
    assert.equal(parseWantsInfo(null), null)
  })
  test('the upsert keeps the saved value when the input is null', () => {
    const src = readFileSync(new URL('../../server/utils/invest.ts', import.meta.url), 'utf8')
    assert.match(src, /wants_info\s*=\s*COALESCE\(EXCLUDED\.wants_info, invest_subscriptions\.wants_info\)/)
  })
  test('the form sends no wantsInfo and has no checkbox for it', () => {
    const page = readFileSync(new URL('../../app/pages/member/invest/[slug]/index.vue', import.meta.url), 'utf8')
    assert.doesNotMatch(page, /v-checkbox/)
    assert.doesNotMatch(page, /form\.wantsInfo|wantsInfo:\s*(false|true|Boolean)/)
  })
})
