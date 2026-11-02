import { mkdirSync } from 'node:fs'
import { type APIRequestContext, expect, request, test } from '@playwright/test'
import { e2eEnv } from './support/guard'
import { apiAs, branchApiToken, db } from './support/meeting'
import { cookiesFor, persona, RUN_DIR } from './support/run'

// REGRESSION: a deal vote end to end, exactly as before the general meeting
// module (ctori-4 meeting-votes, requirement 1), on the e2e branch: the admin API
// publishes a document and a draft round (ctr deals publish), the committee opens
// it on the case page, SPV members vote, the 48 hours are enforced, the committee
// closes, the protocol PDF and the deal_events trail exist. And the CTORI4
// hovedbok (hq 039): a passed invest-4 round needs a lead and a follow-up owner.
// The gates are the deal's: the committee runs it, the board gets nothing extra.
//
// The preview server needs DEAL_DOCUMENTS_DIR (documents and the protocol are
// written there instead of GCS). Run: e2e/preview.sh test e2e/deal-vote.spec.ts

test.describe.configure({ mode: 'serial', timeout: 180_000 })

type Api = Awaited<ReturnType<typeof apiAs>>
const api: Record<string, Api> = {}
let admin: APIRequestContext
const slug = `e2e-deal-vote-${Date.now().toString(36)}`
let roundId = ''
let bundle = ''

async function json(res: Awaited<ReturnType<Api['get']>>, want = 200) {
  const body = await res.json().catch(() => null)
  expect(res.status(), JSON.stringify(body)).toBe(want)
  return body
}

test.beforeAll(async () => {
  for (const k of ['committee-board', 'board', 'invest-3', 'member', 'committee-only']) api[k] = await apiAs(k)
  const token = await branchApiToken('committee-board', ['deals:read', 'deals:write', 'rounds:write'])
  admin = await request.newContext({
    baseURL: e2eEnv().baseUrl,
    extraHTTPHeaders: { authorization: `Bearer ${token}` },
  })
  // A deal in active work, visible to the deploying SPV (invest-3) and the committee.
  await db()`
    WITH org AS (INSERT INTO organizations (name) VALUES (${`E2E deal vote ${slug}`}) RETURNING id)
    INSERT INTO pipeline_deals (organization_id, status, slug, investor_visible, investor_blurb)
    SELECT id, 'to_be_voted', ${slug}, true, 'e2e: a synthetic deal for the regression vote' FROM org
  `
  mkdirSync(`${RUN_DIR}/deal-vote`, { recursive: true })
})

test('ctr deals publish: a document version and a draft round with the server rules', async () => {
  const put = await admin.put(
    `/api/admin/deals/${slug}/documents/memo?title=${encodeURIComponent('Investment memo')}`,
    {
      data: Buffer.from('# Memo\n\nE2E.'),
      headers: { 'content-type': 'text/markdown' },
    },
  )
  expect((await json(put)).document.version).toBe(1)
  const created = await json(
    await admin.post(`/api/admin/deals/${slug}/rounds`, {
      data: {
        group: 'invest-3',
        proposal: { amount: 1500000, currency: 'NOK', instrument: 'SAFE', cap: null, termsSummary: null },
        documents: ['memo'],
      },
    }),
  )
  const r = created.round
  roundId = r.id
  bundle = r.bundleSha256
  expect(r.status).toBe('draft')
  expect(r.rules).toEqual({
    threshold: '2/3',
    base: 'yes+no',
    excluded: ['blank', 'none'],
    weighting: 'person',
    windowH: 48,
    ballot: 'choices_board_only',
    mandate: null,
  })
  expect(bundle).toMatch(/^[0-9a-f]{64}$/)
})

test('the committee opens it; the board, not on the committee, cannot', async () => {
  const path = `/api/member/deals/${slug}/rounds/${roundId}/open`
  expect((await api.board!.post(path, { failOnStatusCode: false })).status()).toBe(403)
  await json(await api['committee-board']!.post(path))
  const r = (await json(await admin.get(`/api/admin/rounds/${roundId}`))).round
  expect(r.status).toBe('open')
  expect(Date.parse(r.closesAt) - Date.parse(r.openedAt)).toBe(48 * 3600 * 1000)
})

test('SPV members vote on the case page; members see counts, the committee names', async () => {
  const vote = (k: string, choice: string, attested = bundle) =>
    api[k]!.post(`/api/member/deals/${slug}/rounds/${roundId}/ballot`, {
      data: { choice, attested },
      failOnStatusCode: false,
    })
  expect((await vote('invest-3', 'yes', 'f'.repeat(64))).status()).toBe(409) // material changed
  await json(await vote('invest-3', 'no'))
  await json(await vote('invest-3', 'yes')) // a change: the latest counts
  await json(await vote('board', 'yes'))
  await json(await vote('committee-board', 'no'))
  expect((await vote('member', 'yes')).status()).toBe(404) // not in the SPV: no case at all

  const asMember = await json(await api['invest-3']!.get(`/api/member/deals/${slug}`))
  const mine = asMember.rounds.find((r: { id: string }) => r.id === roundId)
  expect(mine.tally.yes).toBe(2)
  expect(mine.tally.no).toBe(1)
  expect(mine.named).toBeUndefined()
  expect(mine.me.ballot.choice).toBe('yes')
  const asCommittee = await json(await api['committee-board']!.get(`/api/member/deals/${slug}`))
  expect(asCommittee.rounds.find((r: { id: string }) => r.id === roundId).named.length).toBeGreaterThan(2)
  const banner = await json(await api['invest-3']!.get('/api/member/deals/open-votes'))
  expect(banner.votes.some((v: { roundId: string }) => v.roundId === roundId)).toBe(false) // already voted
})

test('no early close: the 48 hours hold', async () => {
  const res = await api['committee-board']!.post(`/api/member/deals/${slug}/rounds/${roundId}/close`, {
    data: {},
    failOnStatusCode: false,
  })
  expect(res.status()).toBe(409)
  expect((await res.json()).message).toContain('The vote runs until')
})

test('after the deadline the committee closes: 2/3 of yes + no, protocol, deal_events', async () => {
  // Fast-forward the clock on the BRANCH: the 48 hours end in two seconds. (Moving
  // the deadline before the ballots would make them late, and late ballots never count.)
  await db()`
    UPDATE deal_rounds SET opened_at = NOW() - interval '48 hours', closes_at = NOW() + interval '2 seconds'
    WHERE id = ${roundId}
  `
  await new Promise((r) => setTimeout(r, 3000))
  const late = await api['invest-3']!.post(`/api/member/deals/${slug}/rounds/${roundId}/ballot`, {
    data: { choice: 'no', attested: bundle },
    failOnStatusCode: false,
  })
  expect(late.status()).toBe(409) // the vote is closed
  const closed = await json(
    await api['committee-board']!.post(`/api/member/deals/${slug}/rounds/${roundId}/close`, { data: {} }),
  )
  expect(closed.result).toBe('passed')
  const r = (await json(await admin.get(`/api/admin/rounds/${roundId}`))).round
  expect(r.status).toBe('closed')
  expect(r.ledger).toBeNull() // CTORI3 keeps no hovedbok
  expect(r.protocol.sha256).toMatch(/^[0-9a-f]{64}$/)
  const pdf = await api['invest-3']!.get(`/api/member/deals/${slug}/rounds/${roundId}/protocol`)
  expect(pdf.status()).toBe(200)
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
  const kinds = (await db()`
    SELECT e.kind, count(*)::int AS n FROM deal_events e JOIN pipeline_deals d ON d.id = e.deal_id
    WHERE d.slug = ${slug} GROUP BY e.kind ORDER BY e.kind
  `) as { kind: string; n: number }[]
  expect(Object.fromEntries(kinds.map((k) => [k.kind, k.n]))).toEqual({ ballot: 4, round_closed: 1, round_opened: 1 })
  // Idempotent: a second close returns the frozen result.
  const again = await json(await admin.post(`/api/admin/rounds/${roundId}/close`, { data: {} }))
  expect(again.protocol.sha256).toBe(r.protocol.sha256)
})

test('CTORI4 hovedbok (hq 039): a passed invest-4 round needs a lead and a follow-up owner', async () => {
  const created = await json(
    await admin.post(`/api/admin/deals/${slug}/rounds`, {
      data: {
        group: 'invest-4',
        proposal: { amount: 2000000, currency: 'NOK', instrument: 'Aksjer', cap: null, termsSummary: null },
        documents: ['memo'],
      },
    }),
  )
  const id = created.round.id
  // invest-4 is raising and may have no members yet: one synthetic member on the BRANCH
  // (the 'E2E persona: ' prefix keeps it out of persona matching).
  await db()`
    WITH p AS (
      INSERT INTO persons (name, status)
      SELECT 'E2E persona: invest-4 voter', 'active'
      WHERE NOT EXISTS (SELECT 1 FROM persons WHERE name = 'E2E persona: invest-4 voter')
      RETURNING id
    ), person AS (
      SELECT id FROM p UNION SELECT id FROM persons WHERE name = 'E2E persona: invest-4 voter'
    )
    INSERT INTO memberships (person_id, group_id)
    SELECT person.id, g.id FROM person, network_groups g
    WHERE g.slug = 'invest-4'
      AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.person_id = person.id AND m.group_id = g.id)
  `
  await json(await api['committee-board']!.post(`/api/member/deals/${slug}/rounds/${id}/open`))
  const detail = await json(await admin.get(`/api/admin/rounds/${id}`))
  const someone = detail.roster[0]
  expect(someone).toBeTruthy()
  await json(
    await admin.post(`/api/admin/rounds/${id}/ballots`, {
      data: { person: someone.personId, choice: 'yes', method: 'on_behalf', reason: 'e2e on the branch' },
    }),
  )
  await db()`
    UPDATE deal_rounds SET opened_at = NOW() - interval '48 hours', closes_at = NOW() + interval '2 seconds'
    WHERE id = ${id}
  `
  await new Promise((r) => setTimeout(r, 3000))
  const refused = await admin.post(`/api/admin/rounds/${id}/close`, { data: {}, failOnStatusCode: false })
  expect(refused.status()).toBe(409)
  const body = await refused.json()
  expect(body.data.code).toBe('ledger_incomplete')
  expect(body.data.missing.sort()).toEqual(['follow_up_owner', 'lead'])
  const lead = persona('committee-board').personId
  const closed = await json(
    await api['committee-board']!.post(`/api/member/deals/${slug}/rounds/${id}/close`, {
      data: { lead, followUpOwner: lead },
    }),
  )
  expect(closed.result).toBe('passed')
  const r = (await json(await admin.get(`/api/admin/rounds/${id}`))).round
  expect(r.ledger.model).toBe('ctori4-10pct')
  expect(r.ledger.pct).toEqual({ total: 10, follow_up: 4, committee: 3, drivers: 3 })
})

test('page: the case as an SPV member after the vote', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'nb-NO' })
  await ctx.addCookies(cookiesFor(persona('invest-3')))
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`/member/caser/${slug}`)
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page.screenshot({ path: `${RUN_DIR}/deal-vote/case-after-vote.png`, fullPage: true })
  expect(errors).toEqual([])
  await ctx.close()
})
