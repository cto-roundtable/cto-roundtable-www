import { mkdirSync } from 'node:fs'
import { type APIRequestContext, expect, type Page, test } from '@playwright/test'
import { anonymous, apiAs, db } from './support/meeting'
import { cookiesFor, persona, RUN_DIR } from './support/run'

// The general meeting (årsmøte) end to end, as the personas, on the e2e branch
// (needs hq migration 045 applied there). The board sets it up, members check in
// and vote live, the chair (a member who is NOT on the board) runs the saker,
// open and secret ballots, a 2/3 sak, a majority tie settled by the chair's lot,
// the protocol. And who may do what: the board is the gate here, never the
// committee (the deal gate), and a Swedish-only, retired or outside person sees nothing.
//
// Run: e2e/preview.sh test e2e/meeting.spec.ts

test.describe.configure({ mode: 'serial', timeout: 180_000 })

type Api = Awaited<ReturnType<typeof apiAs>>
const api: Record<string, Api> = {}
let anon: APIRequestContext
let meetingId = ''
const items: Record<number, string> = {}

const VOTERS = ['board', 'member', 'invest-1', 'invest-2', 'invest-3', 'committee-only']
const SHOTS = `${RUN_DIR}/meeting`

async function json(res: Awaited<ReturnType<Api['get']>>, want = 200) {
  const body = await res.json().catch(() => null)
  expect(res.status(), JSON.stringify(body)).toBe(want)
  return body
}

const post = (who: string, path: string, data: object = {}) =>
  api[who]!.post(`/api/member/meetings/${meetingId}${path}`, { data, failOnStatusCode: false })
const view = async (who: string) => json(await api[who]!.get(`/api/member/meetings/${meetingId}`))

test.beforeAll(async () => {
  for (const k of [...VOTERS, 'committee-board', 'sweden', 'retired', 'outsider']) api[k] = await apiAs(k)
  anon = await anonymous()
  mkdirSync(SHOTS, { recursive: true })
})

test('only the board creates a meeting; the committee gets nothing extra', async () => {
  for (const k of ['member', 'committee-only', 'invest-3']) {
    const res = await api[k]!.post('/api/member/meetings', {
      data: { kind: 'ordinary', title: 'x' },
      failOnStatusCode: false,
    })
    expect(res.status(), k).toBe(403)
  }
  const created = await json(
    await api.board!.post('/api/member/meetings', {
      data: { kind: 'ordinary', title: `E2E årsmøte ${new Date().toISOString().slice(0, 16)}`, place: 'Video' },
    }),
  )
  meetingId = created.meeting.id
  expect(created.meeting.status).toBe('draft')
  expect(created.meeting.rosterGroup).toBe('cto-roundtable')
  expect(created.meeting.countBase).toBe('yes+no')
})

test('a draft is the board only', async () => {
  for (const k of ['member', 'committee-only', 'invest-3', 'sweden']) {
    expect((await api[k]!.get(`/api/member/meetings/${meetingId}`)).status(), k).toBe(404)
  }
  await view('committee-board')
  for (const k of ['retired', 'outsider']) {
    expect((await api[k]!.get(`/api/member/meetings/${meetingId}`)).status(), k).toBe(401)
  }
  expect((await anon.get(`/api/member/meetings/${meetingId}`)).status()).toBe(401)
})

test('the roster is the active Norwegian members, frozen: no retired, no Swedish-only', async () => {
  expect((await post('member', '/roster')).status()).toBe(403)
  const v = await json(await post('board', '/roster'))
  const [{ n }] = (await db()`
    SELECT count(*)::int AS n FROM memberships m JOIN persons p ON p.id = m.person_id
    JOIN network_groups g ON g.id = m.group_id
    WHERE g.slug = 'cto-roundtable' AND p.status = 'active'
  `) as { n: number }[]
  expect(v.meeting.rosterCount).toBe(n)
  expect(v.meeting.rosterSha256).toMatch(/^[0-9a-f]{64}$/)
  const ids = new Set(v.roster.map((r: { personId: string }) => r.personId))
  for (const k of VOTERS) expect(ids.has(persona(k).personId), k).toBe(true)
  expect(ids.has(persona('retired').personId)).toBe(false)
  expect(ids.has(persona('sweden').personId)).toBe(false)
})

test('the board adds the saker with a preset each, and announces', async () => {
  const add = (title: string, preset: string, ballot: string) => post('board', '/items', { title, preset, ballot })
  expect((await post('committee-only', '/items', { title: 'x', preset: 'majority' })).status()).toBe(403)
  expect((await add('Ugyldig', 'half', 'open')).status()).toBe(400)
  await json(await add('Godkjenning av innkalling og saksliste', 'majority', 'open'))
  await json(await add('Vedtektsendring § 4.2', 'two_thirds', 'secret'))
  await json(await add('Kontingent 2027', 'majority', 'open'))
  const v = await json(await add('Sak som trekkes', 'majority', 'open'))
  for (const it of v.items) items[it.position] = it.id
  await json(await post('board', `/items/${items[4]}/withdraw`, { reason: 'Forslagsstiller trakk den' }))
  const a = await json(await post('board', '/announce'))
  expect(a.meeting.status).toBe('announced')
  expect(a.items.map((i: { rules: { paragraph: string } }) => i.rules.paragraph)).toEqual([
    '§ 5.5',
    '§ 9',
    '§ 5.5',
    '§ 5.5',
  ])
})

test('once announced: Norwegian members see it, Sweden-only and outsiders do not', async () => {
  for (const k of ['member', 'invest-1', 'committee-only']) {
    const v = await view(k)
    expect(v.me.onRoster, k).toBe(true)
    expect(v.me.isBoard, k).toBe(false)
    expect(v.roster, k).toBeNull() // the roster list is the board's and the chair's
  }
  expect((await api.sweden!.get(`/api/member/meetings/${meetingId}`)).status()).toBe(404)
  const list = await json(await api.sweden!.get('/api/member/meetings'))
  expect(list.meetings.some((m: { id: string }) => m.id === meetingId)).toBe(false)
  // Nobody checks in before the session opens.
  expect((await post('member', '/attendance', { present: true })).status()).toBe(409)
})

test('the board opens the session and makes a non-board member the chair', async () => {
  expect((await post('member', '/session', { action: 'open' })).status()).toBe(403)
  await json(await post('board', '/session', { action: 'open' }))
  const patched = await api.board!.patch(`/api/member/meetings/${meetingId}`, {
    data: { chair: persona('member').personId, secretary: persona('invest-1').personId },
  })
  const v = await json(patched)
  expect(v.meeting.chair.id).toBe(persona('member').personId)
  // The chair runs the session, but cannot change the setup.
  expect((await post('member', '/roster')).status()).toBe(403)
  const asChair = await view('member')
  expect(asChair.me.canRun).toBe(true)
  expect(asChair.roster.length).toBeGreaterThan(5)
})

test('members check in; only the chair or the board opens a sak', async () => {
  for (const k of VOTERS) await json(await post(k, '/attendance', { present: true }))
  expect((await post('invest-2', `/items/${items[1]}/open`)).status()).toBe(403)
  expect((await post('committee-board', `/items/${items[1]}/open`)).status()).toBe(200) // a board member
  const v = await view('member')
  expect(v.attendance.count).toBe(VOTERS.length + 0)
  expect(v.items[0].status).toBe('open')
  // One sak at a time.
  expect((await post('member', `/items/${items[2]}/open`)).status()).toBe(409)
})

test('sak 1, open ballot, majority: the latest vote counts, absent members cannot vote', async () => {
  const choices: Record<string, string> = {
    board: 'yes',
    member: 'yes',
    'invest-1': 'yes',
    'invest-2': 'no',
    'invest-3': 'yes',
    'committee-only': 'blank',
  }
  await json(await post('invest-3', `/items/${items[1]}/ballot`, { choice: 'no' }))
  for (const [k, c] of Object.entries(choices)) await json(await post(k, `/items/${items[1]}/ballot`, { choice: c }))
  // committee-board is on the roster but never checked in.
  expect((await post('committee-board', `/items/${items[1]}/ballot`, { choice: 'yes' })).status()).toBe(409)
  expect((await post('member', `/items/${items[1]}/ballot`, { choice: 'maybe' })).status()).toBe(400)
  const live = await view('invest-2')
  expect(live.items[0].progress).toEqual({ voted: 6, present: 6 })
  expect(live.items[0].counts).toBeNull() // no counts until the chair closes
  const v = await json(await post('member', `/items/${items[1]}/close`))
  const it = v.items[0]
  expect(it.status).toBe('closed')
  expect(it.counts).toEqual({ yes: 4, no: 1, blank: 1, present: 6 })
  expect(it.finalOutcome).toBe('passed')
  expect(it.named).toHaveLength(6)
  expect(it.protocolText).toContain('Ja 4, nei 1, blankt 1.')
  expect(it.protocolText).toContain('Resultat: Vedtatt.')
  // Closed is final.
  expect((await post('board', `/items/${items[1]}/ballot`, { choice: 'no' })).status()).toBe(409)
})

test('sak 2, secret ballot, 2/3: one vote each, no names to anyone', async () => {
  await json(await post('member', `/items/${items[2]}/open`))
  const choices: Record<string, string> = {
    board: 'yes',
    member: 'yes',
    'invest-1': 'no',
    'invest-2': 'yes',
    'invest-3': 'no',
    'committee-only': 'yes',
  }
  for (const [k, c] of Object.entries(choices)) await json(await post(k, `/items/${items[2]}/ballot`, { choice: c }))
  expect((await post('member', `/items/${items[2]}/ballot`, { choice: 'no' })).status()).toBe(409)
  expect(
    (
      await post('member', `/items/${items[2]}/ballot-on-behalf`, {
        person: persona('committee-board').personId,
        choice: 'yes',
        reason: 'x',
      })
    ).status(),
  ).toBe(400)
  const mine = await view('invest-1')
  expect(mine.items[1].myVote).toEqual({ voted: true, choice: null })
  const v = await json(await post('member', `/items/${items[2]}/close`))
  const it = v.items[1]
  expect(it.counts).toEqual({ yes: 4, no: 2, blank: 0, present: 6 })
  expect(it.finalOutcome).toBe('passed') // 4 of 6 is exactly 2/3
  expect(it.named).toBeNull()
  expect(it.voters).toHaveLength(6)
  const boardView = await view('board')
  expect(boardView.items[1].named).toBeNull()
  const [{ cols }] = (await db()`
    SELECT array_agg(column_name::text ORDER BY column_name) AS cols
    FROM information_schema.columns WHERE table_name = 'meeting_secret_ballots'
  `) as { cols: string[] }[]
  expect(cols).toEqual(['choice', 'id', 'item_id'])
})

test('sak 3, a majority tie: the chair draws the lot and enters it, once', async () => {
  await json(await post('board', `/items/${items[3]}/open`))
  const choices: Record<string, string> = {
    board: 'yes',
    member: 'yes',
    'invest-1': 'no',
    'invest-2': 'no',
    'invest-3': 'blank',
    'committee-only': 'blank',
  }
  for (const [k, c] of Object.entries(choices)) await json(await post(k, `/items/${items[3]}/ballot`, { choice: c }))
  const closed = await json(await post('member', `/items/${items[3]}/close`))
  expect(closed.items[2].result).toBe('tie')
  expect(closed.items[2].finalOutcome).toBe('tie')
  // The session cannot end with an undrawn tie, and only the chair or the board enters the lot.
  expect((await post('board', '/session', { action: 'close' })).status()).toBe(409)
  expect((await post('committee-only', `/items/${items[3]}/lot`, { outcome: 'passed', note: 'x' })).status()).toBe(403)
  expect((await post('member', `/items/${items[3]}/lot`, { outcome: 'passed' })).status()).toBe(400)
  const v = await json(
    await post('member', `/items/${items[3]}/lot`, { outcome: 'passed', note: 'Mynt, kron er vedtatt' }),
  )
  expect(v.items[2].finalOutcome).toBe('passed')
  expect(v.items[2].protocolText).toContain('Stemmelikhet, avgjort ved loddtrekning (Mynt, kron er vedtatt')
  expect((await post('member', `/items/${items[3]}/lot`, { outcome: 'failed', note: 'igjen' })).status()).toBe(409)
  const [{ n }] = (await db()`
    SELECT count(*)::int AS n FROM meeting_events WHERE item_id = ${items[3]} AND kind = 'lot_recorded'
  `) as { n: number }[]
  expect(n).toBe(1)
})

test('the protocol PDF, then the board closes the session', async () => {
  const pdf = await api['invest-2']!.get(`/api/member/meetings/${meetingId}/protocol`)
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toContain('application/pdf')
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
  expect((await post('member', '/session', { action: 'close' })).status()).toBe(403) // the chair does not end it
  const v = await json(await post('board', '/session', { action: 'close' }))
  expect(v.meeting.status).toBe('closed')
  expect((await post('member', '/attendance', { present: false })).status()).toBe(409)
})

test('a trial meeting is the board on itself, invisible to members', async () => {
  const t = await json(
    await api.board!.post('/api/member/meetings', { data: { kind: 'trial', title: 'E2E prøvemøte' } }),
  )
  const id = t.meeting.id
  expect(t.meeting.rosterGroup).toBe('styret')
  const frozen = await json(await api.board!.post(`/api/member/meetings/${id}/roster`))
  const [{ n }] = (await db()`
    SELECT count(*)::int AS n FROM memberships m JOIN persons p ON p.id = m.person_id
    JOIN network_groups g ON g.id = m.group_id WHERE g.slug = 'styret' AND p.status = 'active'
  `) as { n: number }[]
  expect(frozen.meeting.rosterCount).toBe(n)
  await json(
    await api.board!.post(`/api/member/meetings/${id}/items`, { data: { title: 'Prøvesak', preset: 'majority' } }),
  )
  await json(await api.board!.post(`/api/member/meetings/${id}/announce`))
  for (const k of ['member', 'committee-only', 'invest-3']) {
    expect((await api[k]!.get(`/api/member/meetings/${id}`)).status(), k).toBe(404)
  }
})

// --- The pages, as a member and as the chair, desktop and phone ------------------------

async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

test('pages: a member checks in and votes; the chair closes the sak', async ({ browser }) => {
  // A fresh live meeting with one open sak.
  const m = await json(
    await api.board!.post('/api/member/meetings', { data: { kind: 'ordinary', title: 'E2E årsmøte, sider' } }),
  )
  meetingId = m.meeting.id
  await json(await post('board', '/roster'))
  const withItem = await json(
    await post('board', '/items', { title: 'Godkjenning av årsberetning', preset: 'majority', ballot: 'open' }),
  )
  await json(await post('board', '/items', { title: 'Vedtektsendring § 9', preset: 'two_thirds', ballot: 'secret' }))
  const itemId = withItem.items[0].id
  await json(await post('board', '/announce'))
  await json(await post('board', '/session', { action: 'open' }))
  await json(
    await api.board!.patch(`/api/member/meetings/${meetingId}`, { data: { chair: persona('member').personId } }),
  )
  await json(await post('member', `/items/${itemId}/open`))

  for (const vp of [
    { name: 'desktop', width: 1280, height: 860 },
    { name: 'phone', width: 390, height: 844 },
  ]) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'nb-NO' })
    await ctx.addCookies(cookiesFor(persona('invest-2')))
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/member')
    await expect(page.locator('[data-test="meeting-banner"]').first()).toBeVisible()
    if (vp.name === 'desktop') await shot(page, 'member-banner')
    await page.goto(`/member/arsmote/${meetingId}`)
    if (vp.name === 'desktop') {
      await page.locator('[data-test="check-in"]').click()
      await expect(page.locator('[data-test="me-present"]')).toBeVisible()
      await page.locator('[data-test="vote-yes"]').click()
      await expect(page.locator('[data-test="voted-open"]')).toBeVisible()
    }
    await shot(page, `member-voting-${vp.name}`)
    expect(errors).toEqual([])
    await ctx.close()
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'nb-NO' })
  await ctx.addCookies(cookiesFor(persona('member')))
  const page = await ctx.newPage()
  await page.goto(`/member/arsmote/${meetingId}`)
  await shot(page, 'chair-live')
  await page.locator('[data-test="close-item-1"]').click()
  await expect(page.locator('[data-test="item-1"] [data-test="result"]')).toHaveText('Vedtatt')
  await page.locator('[data-test="item-1"] summary').last().click()
  await expect(page.locator('[data-test="item-1"] [data-test="protocol-text"]')).toContainText('Ja 1, nei 0, blankt 0.')
  await shot(page, 'chair-closed')
  await ctx.close()

  const bctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'nb-NO' })
  await bctx.addCookies(cookiesFor(persona('board')))
  const bpage = await bctx.newPage()
  await bpage.goto('/member/arsmote')
  await shot(bpage, 'board-list-phone')
  await bctx.close()
})
