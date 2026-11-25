import { mkdirSync } from 'node:fs'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { apiAs, db } from './support/meeting'
import { cookiesFor, persona, RUN_DIR } from './support/run'

// Finding a time for the online session, Doodle style (ctori-4 item session-times,
// Snorre 2026-11-25; server/utils/investSessionTimes.ts, hq migration 052, which must be on
// the branch). The committee adds candidate times (Oslo time, length, optional link), a
// member ticks every time that works (ticking signs them up), the committee sees who can
// make each time and who signed up without ticking, and marks one as chosen; then members
// see that time and its link instead of the ticks. Only the committee (never the board
// alone, never a member) can set times. The shared link /member/invest/ctori-4#nettmote
// lands on the card.
//
// The offering's status is set ON THE BRANCH (interest) and put back; every time, pick and
// sign-up made here is deleted afterwards. Production is never touched. Phone and desktop
// screens in `.run/session-times/`, with names, e-mails and notes masked.

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const SLUG = 'ctori-4'
const DIR = `${RUN_DIR}/session-times`
const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }
const URL_MEET = 'https://meet.google.com/abc-defg-hij'
const touched = ['member', 'sweden', 'invest-3', 'committee-board', 'board'].map((k) => persona(k).personId)
let offeringId = ''
let statusBefore = ''
let subsBefore: any[] = []

/** A day in the future, as the committee types it: 'YYYY-MM-DDTHH:mm' (Oslo wall time). */
function futureLocal(daysAhead: number, hhmm: string) {
  const d = new Date(Date.now() + daysAhead * 86_400_000)
  return `${d.toISOString().slice(0, 10)}T${hhmm}`
}
const T1 = futureLocal(14, '19:00')
const T2 = futureLocal(15, '08:30')
const T3 = futureLocal(16, '12:00')

async function setStatus(status: string) {
  await db()`UPDATE invest_offerings SET status = ${status} WHERE id = ${offeringId}`
}

async function cleanup() {
  await db()`DELETE FROM invest_session_times WHERE offering_id = ${offeringId}`
  await db()`DELETE FROM invest_session_signups WHERE offering_id = ${offeringId} AND person_id = ANY(${touched})`
}

async function pageAs(
  browser: Browser,
  key: string,
  viewport = PHONE,
): Promise<{ page: Page; errors: string[]; close: () => Promise<void> }> {
  const phone = viewport === PHONE
  const ctx = await browser.newContext({ viewport, locale: 'nb-NO', isMobile: phone, hasTouch: phone })
  await ctx.addCookies(cookiesFor(persona(key)))
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { page, errors, close: () => ctx.close() }
}

async function timeIds(): Promise<Record<string, string>> {
  const rows = (await db()`
    SELECT id, to_char(starts_at AT TIME ZONE 'Europe/Oslo', 'YYYY-MM-DD"T"HH24:MI') AS local
    FROM invest_session_times WHERE offering_id = ${offeringId}`) as any[]
  return Object.fromEntries(rows.map((r) => [r.local, r.id]))
}

async function picksOf(key: string): Promise<string[]> {
  const rows = (await db()`
    SELECT time_id FROM invest_session_time_picks
    WHERE offering_id = ${offeringId} AND person_id = ${persona(key).personId}`) as any[]
  return rows.map((r) => r.time_id).sort()
}

test.beforeAll(async () => {
  mkdirSync(DIR, { recursive: true })
  const [o] = (await db()`SELECT id, status FROM invest_offerings WHERE slug = ${SLUG}`) as any[]
  offeringId = o.id
  statusBefore = o.status
  subsBefore = (await db()`SELECT person_id, phase, interest_level, amount_nok FROM invest_subscriptions
                           WHERE offering_id = ${offeringId} ORDER BY person_id`) as any[]
  await cleanup()
  await setStatus('interest')
})

test.afterAll(async () => {
  await cleanup()
  if (statusBefore) await setStatus(statusBefore)
})

test('only the committee sets times: a member, a Swede and the board alone get the 404', async () => {
  const fake = '00000000-0000-4000-8000-000000000000'
  for (const key of ['member', 'sweden', 'board']) {
    const api = await apiAs(key)
    const base = `/api/member/invest/${SLUG}/session-times`
    expect((await api.post(base, { data: { start: T1 } })).status(), key).toBe(404)
    expect((await api.patch(`${base}/${fake}`, { data: { meetingUrl: URL_MEET } })).status(), key).toBe(404)
    expect((await api.delete(`${base}/${fake}`)).status(), key).toBe(404)
    expect((await api.post(`${base}/${fake}/choose`, { data: { chosen: true } })).status(), key).toBe(404)
    await api.dispose()
  }
  expect(await db()`SELECT 1 FROM invest_session_times WHERE offering_id = ${offeringId}`).toHaveLength(0)
})

test('the committee adds times: through the page and the API, Oslo time, refused when wrong', async ({ browser }) => {
  const api = await apiAs('committee-board')
  const base = `/api/member/invest/${SLUG}/session-times`
  expect((await api.post(base, { data: { start: T2, durationMinutes: 45 } })).status()).toBe(200)
  expect((await api.post(base, { data: { start: T3, meetingUrl: URL_MEET } })).status()).toBe(200)
  // Refusals: a duplicate, the past, a bad link, a bad length, not a date.
  const refused = async (data: object, status: number, message: string) => {
    const r = await api.post(base, { data })
    expect(r.status(), JSON.stringify(data)).toBe(status)
    expect((await r.json()).message).toBe(message)
  }
  await refused({ start: T2 }, 409, 'invest.sessionTimes.errors.duplicate')
  await refused({ start: '2020-01-01T10:00' }, 409, 'invest.sessionTimes.errors.past')
  await refused({ start: T1, meetingUrl: 'http://meet.google.com/x' }, 400, 'invest.sessionTimes.errors.url')
  await refused({ start: T1, durationMinutes: 5 }, 400, 'invest.sessionTimes.errors.duration')
  await refused({ start: 'neste tirsdag' }, 400, 'invest.sessionTimes.errors.start')
  await api.dispose()

  // The third through the committee page, on a desktop.
  const { page, errors, close } = await pageAs(browser, 'committee-board', DESKTOP)
  await page.goto(`/member/invest/${SLUG}/komite`)
  const card = page.locator('#invest-session-times')
  await expect(card.getByRole('heading', { name: 'Tidspunkt for nettmøtet' })).toBeVisible({ timeout: 20_000 })
  await card.getByLabel('Dato og klokkeslett').fill(T1)
  await card.getByRole('button', { name: 'Legg til', exact: true }).click()
  await expect(card.locator('li.time')).toHaveCount(3)
  // The share link points at the card on the offering page.
  await expect(card.getByText(`/member/invest/${SLUG}#nettmote`)).toBeVisible()
  expect(errors).toEqual([])
  await close()

  // Stored as the instant the committee meant in Oslo, with the default hour, writer named.
  const rows = (await db()`
    SELECT to_char(starts_at AT TIME ZONE 'Europe/Oslo', 'YYYY-MM-DD"T"HH24:MI') AS local, duration_minutes, meeting_url
    FROM invest_session_times WHERE offering_id = ${offeringId} ORDER BY starts_at`) as any[]
  expect(rows).toEqual([
    { local: T1, duration_minutes: 60, meeting_url: null },
    { local: T2, duration_minutes: 45, meeting_url: null },
    { local: T3, duration_minutes: 60, meeting_url: URL_MEET },
  ])
  const audit = (await db()`
    SELECT DISTINCT changed_by FROM audit_log
    WHERE table_name = 'invest_session_times' AND new_data->>'offering_id' = ${offeringId}`) as any[]
  expect(audit.map((a) => a.changed_by)).toEqual([`portal:${persona('committee-board').personId}`])
})

test('a member opens the shared link, ticks two times, and is signed up; the answer is untouched', async ({
  browser,
}) => {
  const ids = await timeIds()
  const { page, errors, close } = await pageAs(browser, 'member')
  await page.goto(`/member/invest/${SLUG}#nettmote`)
  const card = page.locator('#nettmote')
  await expect(card.getByText('Hvilke tidspunkter passer for deg?')).toBeVisible({ timeout: 20_000 })
  await expect(card).toBeInViewport()
  await expect(card.locator('label.time')).toHaveCount(3)
  // No link on a candidate time, even one that has it.
  await expect(card.getByRole('link', { name: 'Bli med i møtet' })).toHaveCount(0)
  const signUp = card.getByRole('button', { name: 'Meld meg på med disse tidspunktene' })
  await expect(signUp).toBeDisabled()
  await page.screenshot({ path: `${DIR}/1-member-times.png` })

  await card.locator('label.time').nth(0).click()
  await card.locator('label.time').nth(2).click()
  await page.screenshot({ path: `${DIR}/2-member-ticked.png` })
  await signUp.click()
  await expect(card.getByText('Takk! Du er påmeldt, og vi har lagret 2 tidspunkter.')).toBeVisible()
  await page.screenshot({ path: `${DIR}/3-member-saved.png` })
  expect(await picksOf('member')).toEqual([ids[T1], ids[T3]].sort())
  expect(
    await db()`SELECT 1 FROM invest_session_signups
                     WHERE offering_id = ${offeringId} AND person_id = ${persona('member').personId}`,
  ).toHaveLength(1)

  // Change of mind: untick one, tick another.
  await card.locator('label.time').nth(0).click()
  await card.locator('label.time').nth(1).click()
  await card.getByRole('button', { name: 'Lagre endringene' }).click()
  await expect(card.getByText('Takk! Du er påmeldt, og vi har lagret 2 tidspunkter.')).toBeVisible()
  expect(await picksOf('member')).toEqual([ids[T2], ids[T3]].sort())

  // The API gives the member their own ticks and no link on a candidate time.
  const api = await apiAs('member')
  const body = await (await api.get(`/api/member/invest/${SLUG}`)).json()
  expect(body.session.picks.sort()).toEqual([ids[T2], ids[T3]].sort())
  expect(body.sessionTimes.map((x: any) => x.meetingUrl)).toEqual([null, null, null])
  expect(body.sessionTimes[0].people).toBeUndefined()
  await api.dispose()
  expect(errors).toEqual([])
  await close()
})

test('a Swede ticks one; empty ticks without a sign-up and unknown times are refused', async ({ browser }) => {
  const ids = await timeIds()
  const api = await apiAs('sweden')
  const url = `/api/member/invest/${SLUG}/session/times`
  const r0 = await api.post(url, { data: { timeIds: [] } })
  expect(r0.status()).toBe(400)
  expect((await r0.json()).message).toBe('invest.sessionTimes.errors.pickOne')
  const r1 = await api.post(url, { data: { timeIds: ['99999999-9999-4999-8999-999999999999'] } })
  expect((await r1.json()).message).toBe('invest.sessionTimes.errors.gone')
  expect((await api.post(url, { data: { timeIds: [ids[T3]] } })).status()).toBe(200)
  await api.dispose()
  expect(await picksOf('sweden')).toEqual([ids[T3]])

  const { page, errors, close } = await pageAs(browser, 'sweden')
  await page.goto(`/member/invest/${SLUG}#nettmote`)
  await expect(page.locator('#nettmote label.time.on')).toHaveCount(1, { timeout: 20_000 })
  await page.screenshot({ path: `${DIR}/4-sweden-ticked.png` })
  expect(errors).toEqual([])
  await close()
})

test('the committee sees who can make each time, and who signed up without ticking', async ({ browser }) => {
  // invest-3 signs up the old way, with no tick.
  const i3 = await apiAs('invest-3')
  expect((await i3.post(`/api/member/invest/${SLUG}/session`, { data: {} })).status()).toBe(200)
  await i3.dispose()

  const ids = await timeIds()
  const board = await apiAs('board')
  expect((await board.get(`/api/member/invest/${SLUG}/komite`)).status()).toBe(404)
  await board.dispose()

  const api = await apiAs('committee-board')
  const page1 = await (await api.get(`/api/member/invest/${SLUG}/komite`)).json()
  await api.dispose()
  const byId = Object.fromEntries(page1.sessionTimes.map((x: any) => [x.id, x]))
  const name = (k: string) => persona(k).name
  expect(byId[ids[T1]].people).toEqual([])
  expect(byId[ids[T2]].people).toEqual([name('member')])
  expect(byId[ids[T3]].people.sort()).toEqual([name('member'), name('sweden')].sort())
  expect(byId[ids[T3]].meetingUrl).toBe(URL_MEET)
  const i3row = page1.sessionSignups.find((s: any) => s.name === name('invest-3'))
  expect(i3row.picks).toBe(0)

  for (const [viewport, file] of [
    [DESKTOP, '5-committee-desktop.png'],
    [PHONE, '6-committee-phone.png'],
  ] as const) {
    const { page, errors, close } = await pageAs(browser, 'committee-board', viewport)
    await page.goto(`/member/invest/${SLUG}/komite`)
    const card = page.locator('#invest-session-times')
    await expect(card.locator('li.time').nth(2).getByText('2 kan')).toBeVisible({ timeout: 20_000 })
    await expect(card.getByText(/Påmeldt uten å krysse av: \d+/)).toBeVisible()
    await expect(card.getByText(name('invest-3'), { exact: false }).first()).toBeVisible()
    await card.screenshot({ path: `${DIR}/${file}`, mask: [card.locator('.people')], maskColor: '#333' })
    expect(errors).toEqual([])
    await close()
  }
})

test('the committee picks a time: members see it and the link, ticks are closed, one chosen at most', async ({
  browser,
}) => {
  const ids = await timeIds()
  const { page, errors, close } = await pageAs(browser, 'committee-board', DESKTOP)
  await page.goto(`/member/invest/${SLUG}/komite`)
  const card = page.locator('#invest-session-times')
  const third = card.locator('li.time').nth(2)
  await third.getByRole('button', { name: 'Velg dette tidspunktet' }).click({ timeout: 20_000 })
  await expect(third.getByText('Valgt')).toBeVisible()
  expect(errors).toEqual([])
  await close()

  const chosen = (await db()`SELECT id FROM invest_session_times
                             WHERE offering_id = ${offeringId} AND chosen_at IS NOT NULL`) as any[]
  expect(chosen.map((c) => c.id)).toEqual([ids[T3]])

  const m = await pageAs(browser, 'member')
  await m.page.goto(`/member/invest/${SLUG}#nettmote`)
  const mc = m.page.locator('#nettmote')
  await expect(mc.getByText('Nettmøtet blir')).toBeVisible({ timeout: 20_000 })
  await expect(mc.getByRole('link', { name: 'Bli med i møtet' })).toHaveAttribute('href', URL_MEET)
  await expect(mc.locator('label.time')).toHaveCount(0)
  await m.page.screenshot({ path: `${DIR}/7-member-chosen.png` })
  expect(m.errors).toEqual([])
  await m.close()

  // Ticks are over once a time is chosen.
  const api = await apiAs('member')
  const late = await api.post(`/api/member/invest/${SLUG}/session/times`, { data: { timeIds: [ids[T1]] } })
  expect(late.status()).toBe(409)
  expect(
    (await api.get(`/api/member/invest/${SLUG}`).then((r) => r.json())).sessionTimes.find((x: any) => x.chosen)
      .meetingUrl,
  ).toBe(URL_MEET)
  await api.dispose()

  // Choosing another moves the mark; unchoosing takes it off.
  const c = await apiAs('committee-board')
  const base = `/api/member/invest/${SLUG}/session-times`
  expect((await c.post(`${base}/${ids[T1]}/choose`, { data: { chosen: true } })).status()).toBe(200)
  expect(
    (
      (await db()`SELECT id FROM invest_session_times WHERE offering_id = ${offeringId} AND chosen_at IS NOT NULL`) as any[]
    ).map((r) => r.id),
  ).toEqual([ids[T1]])
  expect((await c.post(`${base}/${ids[T1]}/choose`, { data: { chosen: false } })).status()).toBe(200)
  expect(
    await db()`SELECT 1 FROM invest_session_times WHERE offering_id = ${offeringId} AND chosen_at IS NOT NULL`,
  ).toHaveLength(0)
  // A link set later, and a removal that takes its ticks.
  expect((await c.patch(`${base}/${ids[T2]}`, { data: { meetingUrl: URL_MEET } })).status()).toBe(200)
  expect((await c.patch(`${base}/${ids[T2]}`, { data: { meetingUrl: 'javascript:alert(1)' } })).status()).toBe(400)
  expect((await c.delete(`${base}/${ids[T2]}`)).status()).toBe(200)
  await c.dispose()
  expect(await picksOf('member')).toEqual([ids[T3]])
})

test('undo the sign-up: the ticks go with it; the interest answers never changed', async () => {
  const api = await apiAs('member')
  expect((await api.delete(`/api/member/invest/${SLUG}/session`)).status()).toBe(200)
  await api.dispose()
  expect(await picksOf('member')).toEqual([])
  const subsAfter = (await db()`SELECT person_id, phase, interest_level, amount_nok FROM invest_subscriptions
                               WHERE offering_id = ${offeringId} ORDER BY person_id`) as any[]
  expect(subsAfter).toEqual(subsBefore)
})

test('closed: nobody sets times or ticks', async () => {
  await setStatus('closed')
  const c = await apiAs('committee-board')
  expect((await c.post(`/api/member/invest/${SLUG}/session-times`, { data: { start: T1 } })).status()).toBe(404)
  await c.dispose()
  const m = await apiAs('sweden')
  expect((await m.post(`/api/member/invest/${SLUG}/session/times`, { data: { timeIds: [] } })).status()).toBe(404)
  await m.dispose()
  await setStatus('interest')
})
