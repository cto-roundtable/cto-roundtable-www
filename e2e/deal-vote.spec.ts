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
// Hidden ballots (komité 2026-11-03): while the vote runs no member sees a count or
// anyone else's choice, before or after voting; the committee sees every choice by
// name and the counts, live, on the case page and in the admin API (dc-95 H1, Snorre
// 2026-11-07); members get the counts after close.
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
// The deadline is the branch's NOW() + 2 seconds; the wait is the box's clock. Neon runs
// 1 to 1.5 s ahead of this box, so 3 s of slack over the deadline, not 1.
const PAST_DEADLINE_MS = 5000

async function json(res: Awaited<ReturnType<Api['get']>>, want = 200) {
  const body = await res.json().catch(() => null)
  expect(res.status(), JSON.stringify(body)).toBe(want)
  return body
}

test.beforeAll(async () => {
  for (const k of ['committee-board', 'board', 'invest-3', 'member', 'committee-only', 'retired-investor-3'])
    api[k] = await apiAs(k)
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
    ballot: 'choices_committee',
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

const roundAs = async (k: string) =>
  (await json(await api[k]!.get(`/api/member/deals/${slug}`))).rounds.find((r: { id: string }) => r.id === roundId)

/** Nothing in this round view says how anyone voted, except the viewer's own ballot. */
function expectNoChoices(view: any, own: string | null) {
  expect(view.tally).toBeNull()
  expect(view.liveCounts).toBe(false)
  expect(view.me.ballot?.choice ?? null).toBe(own)
  const { me: _me, ...rest } = view
  expect(JSON.stringify(rest)).not.toMatch(/"(yes|no|blank|defaultBlank|choice)"\s*:/)
}

test('SPV members vote on the case page; no member sees a count or another choice while it runs', async () => {
  const vote = (k: string, choice: string, attested = bundle) =>
    api[k]!.post(`/api/member/deals/${slug}/rounds/${roundId}/ballot`, {
      data: { choice, attested },
      failOnStatusCode: false,
    })
  expect((await vote('invest-3', 'yes', 'f'.repeat(64))).status()).toBe(409) // material changed
  await json(await vote('board', 'yes'))
  await json(await vote('committee-board', 'no')) // the first no: what others piled onto

  // A voter who has NOT voted yet sees neither the no nor any count, only how many have voted.
  const before = await roundAs('invest-3')
  expectNoChoices(before, null)
  expect(before.turnout).toMatchObject({ voted: 2 })
  expect(before.named).toBeUndefined()
  // A pensjonist in the SPV keeps their seat (portalAccess.ts, 2026-11-06): on the roster,
  // sees the vote like any voter, no count.
  const retired = await roundAs('retired-investor-3')
  expect(retired.me.onRoster).toBe(true)
  expectNoChoices(retired, null)

  await json(await vote('invest-3', 'no'))
  await json(await vote('invest-3', 'yes')) // a change: the latest counts
  expect((await vote('member', 'yes')).status()).toBe(404) // not in the SPV: no case at all

  // ...nor after voting: own ballot, the turnout, nothing else.
  const after = await roundAs('invest-3')
  expectNoChoices(after, 'yes')
  expect(after.turnout).toMatchObject({ voted: 3 })
  expect(Object.keys(after.turnout).sort()).toEqual(['eligible', 'turnout', 'voted'])
  expect(after.named).toBeUndefined()
  const banner = await json(await api['invest-3']!.get('/api/member/deals/open-votes'))
  expect(banner.votes.some((v: { roundId: string }) => v.roundId === roundId)).toBe(false) // already voted
})

test('the committee sees who voted what, and the counts, live, in the portal and the API', async () => {
  const view = await roundAs('committee-board')
  expect(view.liveCounts).toBe(false) // members get no live counts...
  expect(view.namedChoices).toBe(true) // ...the committee gets the choices
  expect(view.tally).toMatchObject({ yes: 2, no: 1 })
  const byName = new Map(view.named.map((n: { name: string; counted: string }) => [n.name, n.counted]))
  expect(byName.get(persona('invest-3').name)).toBe('yes') // the latest ballot counts
  expect(byName.get(persona('board').name)).toBe('yes')
  expect(byName.get(persona('committee-board').name)).toBe('no')
  // Those who have not voted show as not voted (or standing blank), so the committee can chase them.
  expect(view.named.filter((n: { counted: string }) => ['yes', 'no', 'blank'].includes(n.counted)).length).toBe(3)
  expect(view.turnout.voted).toBe(3)

  // The admin API (ctr rounds show / list, deals:read: the committee): the same.
  const detail = await json(await admin.get(`/api/admin/rounds/${roundId}`))
  expect(detail.round.tally).toMatchObject({ yes: 2, no: 1 })
  expect(detail.round.turnout.voted).toBe(3)
  expect(detail.round.rules.ballot).toBe('choices_committee')
  expect(detail.ballots.length).toBe(4) // invest-3 voted twice: every cast is a row
  expect(detail.ballots.map((b: { choice: string }) => b.choice).sort()).toEqual(['no', 'no', 'yes', 'yes'])
  const list = await json(await admin.get('/api/admin/rounds?status=open'))
  expect(list.rounds.find((r: { id: string }) => r.id === roundId).tally).toMatchObject({ yes: 2, no: 1 })
})

test('page: the open vote as an SPV member (no counts) and as the committee (counts, names)', async ({ browser }) => {
  for (const k of ['invest-3', 'committee-board']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'nb-NO' })
    await ctx.addCookies(cookiesFor(persona(k)))
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`/member/caser/${slug}`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.screenshot({ path: `${RUN_DIR}/deal-vote/case-open-${k}.png`, fullPage: true })
    const text = await page.locator('.round').first().innerText()
    expect(text).toContain('Medlemmene ser ikke hva andre har stemt')
    if (k === 'committee-board') {
      expect(text).toMatch(/Ja 2 · Nei 1/)
      expect(text).toMatch(/navngitte stemmer/i) // the label is uppercased in CSS
    } else {
      expect(text).not.toMatch(/Ja \d+ · Nei \d+/)
      expect(text).not.toMatch(/navngitte stemmer/i)
    }
    expect(errors).toEqual([])
    await ctx.close()
  }
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
  await new Promise((r) => setTimeout(r, PAST_DEADLINE_MS))
  const late = await api['invest-3']!.post(`/api/member/deals/${slug}/rounds/${roundId}/ballot`, {
    data: { choice: 'no', attested: bundle },
    failOnStatusCode: false,
  })
  expect(late.status()).toBe(409) // the vote is closed
  const closed = await json(
    await api['committee-board']!.post(`/api/member/deals/${slug}/rounds/${roundId}/close`, { data: {} }),
  )
  expect(closed.result).toBe('passed')
  const shown = await json(await admin.get(`/api/admin/rounds/${roundId}`))
  const r = shown.round
  expect(r.status).toBe('closed')
  expect(r.ledger).toBeNull() // CTORI3 keeps no hovedbok
  // After close the counts are the result, for everyone who sees the case; names stay the committee's.
  expect(r.tally).toMatchObject({ yes: 2, no: 1 })
  const asMember = await roundAs('invest-3')
  expect(asMember.tally).toMatchObject({ yes: 2, no: 1 })
  expect(asMember.named).toBeUndefined()
  const asCommittee = await roundAs('committee-board')
  expect(asCommittee.tally).toMatchObject({ yes: 2, no: 1 })
  expect(asCommittee.named.filter((n: { counted: string }) => n.counted === 'yes').length).toBe(2)
  // The record keeps every choice by person: the count and the protocol never depend on the switch.
  const [snap] = (await db()`SELECT result_snapshot FROM deal_rounds WHERE id = ${roundId}`) as any[]
  expect(snap.result_snapshot.ballots.filter((x: { counted: string }) => x.counted === 'yes').length).toBe(2)
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
  const registered = await json(
    await admin.post(`/api/admin/rounds/${id}/ballots`, {
      data: { person: someone.personId, choice: 'yes', method: 'on_behalf', reason: 'e2e on the branch' },
    }),
  )
  // A rounds:write response may go to a board-only owner: no live count there (withTally's default).
  expect(registered.tally).toBeNull()
  expect(registered.turnout.voted).toBe(1)
  await db()`
    UPDATE deal_rounds SET opened_at = NOW() - interval '48 hours', closes_at = NOW() + interval '2 seconds'
    WHERE id = ${id}
  `
  await new Promise((r) => setTimeout(r, PAST_DEADLINE_MS))
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
