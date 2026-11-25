import { mkdirSync } from 'node:fs'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { anonymous, apiAs, db } from './support/meeting'
import { cookiesFor, persona, RUN_DIR } from './support/run'

// The portal visit log (server/utils/portalVisits.ts, ctori-4 item portal-visits, Snorre
// 2026-11-25): a signed-in page view under /member is one activity_events row (source
// 'portal'), a first load and a client-side navigation alike, at most one per person and
// page in 10 minutes, no cookie consent involved. The committee reads who opened an
// offering on its committee page; a plain member and the board alone get the 404.
//
// The offering's status is set to interest ON THE BRANCH only and put back afterwards,
// and every portal row for the personas used here is removed again. Production is never
// touched.

test.describe.configure({ mode: 'serial', timeout: 180_000 })

const SLUG = 'ctori-4'
const DIR = `${RUN_DIR}/portal-visits`
const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 860 }
const KEYS = ['member', 'board', 'committee-board', 'sweden']
let ids: string[] = []
let statusBefore = ''

async function view(browser: Browser, key: string, size: { width: number; height: number }) {
  const phone = size.width < 600
  const ctx = await browser.newContext({ viewport: size, locale: 'nb-NO', isMobile: phone, hasTouch: phone })
  await ctx.addCookies(cookiesFor(persona(key)))
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { page, errors, close: () => ctx.close() }
}

async function visits(personId: string): Promise<{ channel_id: string; occurred_at: Date }[]> {
  return (await db()`SELECT channel_id, occurred_at FROM activity_events
                     WHERE source = 'portal' AND event_type = 'page_view' AND person_id = ${personId}
                     ORDER BY occurred_at`) as any[]
}

/** Wait for the fire-and-forget POST to land. */
async function until(personId: string, path: string, n = 1) {
  await expect
    .poll(async () => (await visits(personId)).filter((v) => v.channel_id === path).length, { timeout: 15_000 })
    .toBe(n)
}

function shot(page: Page, path: string, mask: ReturnType<Page['locator']>[] = []) {
  return page.screenshot({
    path,
    mask: [page.locator('.member-appbar span.mr-3'), page.locator('.member-drawer .font-weight-bold'), ...mask],
    maskColor: '#333',
  })
}

test.beforeAll(async () => {
  mkdirSync(DIR, { recursive: true })
  ids = KEYS.map((k) => persona(k).personId)
  await db()`DELETE FROM activity_events WHERE source = 'portal' AND person_id = ANY(${ids})`
  const [o] = (await db()`SELECT status FROM invest_offerings WHERE slug = ${SLUG}`) as any[]
  statusBefore = o.status
  await db()`UPDATE invest_offerings SET status = 'interest' WHERE slug = ${SLUG}`
})

test.afterAll(async () => {
  await db()`DELETE FROM activity_events WHERE source = 'portal' AND person_id = ANY(${ids})`
  await db()`UPDATE invest_offerings SET status = ${statusBefore} WHERE slug = ${SLUG}`
})

test('the write: signed in only, portal pages only, one per page in 10 minutes', async () => {
  const anon = await anonymous()
  expect((await anon.post('/api/member/visit', { data: { path: '/member' } })).status()).toBe(401)
  await anon.dispose()

  const me = persona('member').personId
  const api = await apiAs('member')
  for (const path of ['/privacy', '/api/member/info', '/member/<x>', 42]) {
    expect((await api.post('/api/member/visit', { data: { path } })).status(), String(path)).toBe(204)
  }
  expect(await visits(me)).toEqual([])

  expect((await api.post('/api/member/visit', { data: { path: '/member/caser?x=1' } })).status()).toBe(204)
  expect((await api.post('/api/member/visit', { data: { path: '/member/caser/' } })).status()).toBe(204)
  expect((await api.post('/api/member/visit', { data: { path: '/Member/Caser' } })).status()).toBe(204)
  expect((await visits(me)).map((v) => v.channel_id)).toEqual(['/member/caser'])
  // The body cannot name someone else: the person is the session's.
  expect((await api.post('/api/member/visit', { data: { path: '/member', personId: ids[1] } })).status()).toBe(204)
  expect(await visits(ids[1])).toEqual([])
  await api.dispose()

  // A pensjonist may log their own visits too (every level may call it).
  const retired = await apiAs('retired')
  expect((await retired.post('/api/member/visit', { data: { path: '/member' } })).status()).toBe(204)
  await db()`DELETE FROM activity_events WHERE source = 'portal' AND person_id = ${retired.persona.personId}`
  await retired.dispose()
})

test('a first load and a client-side navigation are both logged, cookie banner unanswered', async ({ browser }) => {
  const me = persona('member').personId
  const { page, errors, close } = await view(browser, 'member', DESKTOP)
  await page.goto('/member')
  await until(me, '/member')
  // Client-side: the menu item, no page load.
  await page.locator(`.member-drawer a[href="/member/invest/${SLUG}"]`).first().click()
  await expect(page).toHaveURL(new RegExp(`/member/invest/${SLUG}$`), { timeout: 20_000 })
  await until(me, `/member/invest/${SLUG}`)
  // Back and forth again within 10 minutes: still one row each.
  await page.goBack()
  await page.goForward()
  await page.reload()
  await page.waitForTimeout(2_000)
  await until(me, '/member')
  await until(me, `/member/invest/${SLUG}`)
  expect(await page.evaluate(() => localStorage.getItem('ctr_analytics_consent'))).toBeNull()
  expect(errors).toEqual([])
  await close()
})

test('a Swedish-only member is logged on their own pages', async ({ browser }) => {
  const me = persona('sweden').personId
  const { page, close } = await view(browser, 'sweden', DESKTOP)
  await page.goto('/member/sweden')
  await until(me, '/member/sweden')
  await close()
})

test('a plain member and the board alone get the 404 on the visit list', async () => {
  for (const key of ['member', 'board', 'invest-3', 'sweden']) {
    const api = await apiAs(key)
    expect((await api.get(`/api/member/invest/${SLUG}/visits`)).status(), key).toBe(404)
    await api.dispose()
  }
  const anon = await anonymous()
  expect((await anon.get(`/api/member/invest/${SLUG}/visits`)).status()).toBe(401)
  await anon.dispose()
})

test('the committee sees who opened the offering, how often and what they answered', async ({ browser }) => {
  const api = await apiAs('committee-board')
  // The committee's own visit to its committee page does not count as a visit to the offering.
  expect((await api.post('/api/member/visit', { data: { path: `/member/invest/${SLUG}/komite` } })).status()).toBe(204)
  const res = await api.get(`/api/member/invest/${SLUG}/visits`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.loggingSince).toBeTruthy()
  const row = body.rows.find((r: any) => r.personId === persona('member').personId)
  expect(row).toMatchObject({ name: persona('member').name, visits: 1, documentViews: 0 })
  expect(body.rows.find((r: any) => r.personId === persona('committee-board').personId)).toBeUndefined()
  expect(body.visitors).toBe(body.rows.length)
  await api.dispose()

  for (const [label, size] of [
    ['desktop', DESKTOP],
    ['phone', PHONE],
  ] as const) {
    const { page, errors, close } = await view(browser, 'committee-board', size)
    await page.goto(`/member/invest/${SLUG}/komite`)
    const section = page.locator('#offering-visits')
    await expect(section.getByRole('heading', { name: /^Hvem har åpnet siden \(\d+\)$/ })).toBeVisible({
      timeout: 20_000,
    })
    await expect(section.getByText(persona('member').name)).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, label).toBeLessThanOrEqual(1)
    await section.scrollIntoViewIfNeeded()
    // Real members' names stay out of the published screenshot.
    await shot(page, `${DIR}/komite-${label}.png`, [
      page.locator('.font-weight-bold'),
      page.locator('tr.signup, li.signup, tr.answer-row, li.answer-row'),
    ])
    expect(errors).toEqual([])
    await close()
  }
})

test('the board report shows portal views as their own column, outside the score', async ({ browser }) => {
  const api = await apiAs('board')
  const body = await (await api.get('/api/member/board/activity')).json()
  const row = body.members.find((m: any) => m.personId === persona('member').personId)
  expect(row.portalViews).toBeGreaterThanOrEqual(1)
  expect(row.lastPortal).toBeTruthy()
  await api.dispose()

  const { page, errors, close } = await view(browser, 'board', DESKTOP)
  await page.goto('/member/activity')
  await expect(page.getByRole('columnheader', { name: 'Portal' })).toBeVisible({ timeout: 20_000 })
  expect(errors).toEqual([])
  await close()
})
