import { mkdirSync } from 'node:fs'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { apiAs, db } from './support/meeting'
import { cookiesFor, persona, RUN_DIR } from './support/run'

// CTORI4, Snorre 2026-11-12 (ctori-4 item committee-page): the form's "Kanskje" with a
// hint to the online session instead of the "vil vite mer" checkbox (and a saved
// wants_info left alone), the Oversikt banner as an announcement while it is open for
// interest, and the committee's page /member/invest/ctori-4/komite (current-komite only,
// the board alone and a plain member get the 404). Desktop and 390 px screens.
//
// The offering's status is set to interest ON THE BRANCH only and put back afterwards,
// and every row this spec writes is restored. Production is never touched.

test.describe.configure({ mode: 'serial', timeout: 180_000 })

const SLUG = 'ctori-4'
const DIR = `${RUN_DIR}/committee-page`
const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 860 }
const NOTE = 'Kveld passer best. E2E-test.'
const touched = ['member', 'invest-3'].map((k) => persona(k).personId)
let offeringId = ''
let statusBefore = ''
let rowsBefore: any[] = []
let signupsBefore: any[] = []

async function view(
  browser: Browser,
  key: string,
  size: { width: number; height: number },
): Promise<{ page: Page; errors: string[]; close: () => Promise<void> }> {
  const phone = size.width < 600
  const ctx = await browser.newContext({ viewport: size, locale: 'nb-NO', isMobile: phone, hasTouch: phone })
  await ctx.addCookies(cookiesFor(persona(key)))
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { page, errors, close: () => ctx.close() }
}

/** The signed-in member's own name (app bar, drawer) stays out of every screenshot. */
function shot(page: Page, path: string, mask: ReturnType<Page['locator']>[] = []) {
  return page.screenshot({
    path,
    mask: [page.locator('.member-appbar span.mr-3'), page.locator('.member-drawer .font-weight-bold'), ...mask],
    maskColor: '#333',
  })
}

async function subscription(personId: string) {
  const [row] = (await db()`SELECT phase, interest_level, amount_nok, wants_info FROM invest_subscriptions
                            WHERE offering_id = ${offeringId} AND person_id = ${personId}`) as any[]
  return row ?? null
}

test.beforeAll(async () => {
  mkdirSync(DIR, { recursive: true })
  const [o] = (await db()`SELECT id, status FROM invest_offerings WHERE slug = ${SLUG}`) as any[]
  offeringId = o.id
  statusBefore = o.status
  rowsBefore = (await db()`SELECT * FROM invest_subscriptions
                           WHERE offering_id = ${offeringId} AND person_id = ANY(${touched})`) as any[]
  signupsBefore = (await db()`SELECT * FROM invest_session_signups
                              WHERE offering_id = ${offeringId} AND person_id = ANY(${touched})`) as any[]
  // A clean start: the member has not answered (so the banner shows); invest-3 said yes
  // earlier AND ticked "vil vite mer" (the checkbox this change removes).
  await db()`DELETE FROM invest_subscriptions WHERE offering_id = ${offeringId} AND person_id = ANY(${touched})`
  await db()`DELETE FROM invest_session_signups WHERE offering_id = ${offeringId} AND person_id = ANY(${touched})`
  await db()`INSERT INTO invest_subscriptions (offering_id, person_id, phase, interest_level, amount_nok, vehicle, wants_info, source)
             VALUES (${offeringId}, ${persona('invest-3').personId}, 'interest', 'yes', 100000, 'personal', true, 'portal')`
  await db()`UPDATE invest_offerings SET status = 'interest' WHERE id = ${offeringId}`
})

test.afterAll(async () => {
  await db()`DELETE FROM invest_subscriptions WHERE offering_id = ${offeringId} AND person_id = ANY(${touched})`
  await db()`DELETE FROM invest_session_signups WHERE offering_id = ${offeringId} AND person_id = ANY(${touched})`
  for (const b of rowsBefore)
    await db()`INSERT INTO invest_subscriptions (id, offering_id, person_id, phase, interest_level, amount_nok, vehicle,
                 organization_id, wants_info, wants_to_help, notes, source)
               VALUES (${b.id}, ${b.offering_id}, ${b.person_id}, ${b.phase}, ${b.interest_level}, ${b.amount_nok},
                 ${b.vehicle}, ${b.organization_id}, ${b.wants_info}, ${b.wants_to_help}, ${b.notes}, ${b.source})`
  for (const b of signupsBefore)
    await db()`INSERT INTO invest_session_signups (offering_id, person_id, note, source)
               VALUES (${b.offering_id}, ${b.person_id}, ${b.note}, ${b.source})`
  if (statusBefore) await db()`UPDATE invest_offerings SET status = ${statusBefore} WHERE id = ${offeringId}`
})

test('the banner on Oversikt announces that it is open', async ({ browser }) => {
  for (const [label, size] of [
    ['desktop', DESKTOP],
    ['phone', PHONE],
  ] as const) {
    const { page, errors, close } = await view(browser, 'member', size)
    await page.goto('/member')
    const banner = page.locator('.invest-banner')
    await expect(banner).toContainText('er åpen for interesse nå', { timeout: 20_000 })
    await expect(banner).not.toContainText('er du med?')
    await expect(banner).toContainText('eller meld deg på et nettmøte først. Ikke bindende.')
    await shot(page, `${DIR}/1-banner-${label}.png`)
    expect(errors).toEqual([])
    await close()
  }
})

test('the form: "Kanskje" with the hint to the session, and no "vil vite mer" checkbox', async ({ browser }) => {
  for (const [label, size] of [
    ['desktop', DESKTOP],
    ['phone', PHONE],
  ] as const) {
    const { page, errors, close } = await view(browser, 'member', size)
    await page.goto(`/member/invest/${SLUG}`)
    await expect(page.getByRole('heading', { name: 'Er du med?' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Kanskje, vil vite mer' })).toHaveCount(0)
    const hint = page.getByText('Usikker? Meld deg på nettmøtet øverst på siden.')
    await expect(hint).toHaveCount(0)

    await page.getByRole('button', { name: 'Ja, jeg er med' }).click()
    await expect(page.getByText('Jeg vil gjerne vite mer før tegningen')).toHaveCount(0)
    await expect(page.getByRole('checkbox')).toHaveCount(0)

    await page.getByRole('button', { name: 'Kanskje', exact: true }).click()
    await expect(hint).toBeVisible()
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await hint.scrollIntoViewIfNeeded()
    await shot(page, `${DIR}/2-form-maybe-${label}.png`)

    // The hint takes you to the session card at the top.
    await hint.click()
    await expect(page.getByRole('heading', { name: 'Vil du høre mer først?' })).toBeInViewport({ timeout: 5_000 })
    expect(errors).toEqual([])
    await close()
  }
})

test('saving an answer from the form leaves a saved wants_info alone', async ({ browser }) => {
  const me = persona('invest-3').personId
  expect((await subscription(me)).wants_info).toBe(true)
  const { page, errors, close } = await view(browser, 'invest-3', PHONE)
  await page.goto(`/member/invest/${SLUG}`)
  await page.getByRole('button', { name: 'Kanskje', exact: true }).click({ timeout: 20_000 })
  const posted = page.waitForRequest((r) => r.url().endsWith(`/api/member/invest/${SLUG}/interest`))
  await page.getByRole('button', { name: 'Oppdater svaret' }).click()
  const body = (await posted).postDataJSON()
  expect(body.answer).toBe('maybe')
  expect('wantsInfo' in body).toBe(false)
  await expect(page.getByText('Notert: du vurderer det.')).toBeVisible()
  const row = await subscription(me)
  expect(row.interest_level).toBe('maybe')
  expect(row.wants_info).toBe(true)
  expect(errors).toEqual([])
  await close()

  // Via the API too: an answer without wantsInfo leaves it as it is.
  const api = await apiAs('invest-3')
  expect(
    (await api.post(`/api/member/invest/${SLUG}/interest`, { data: { answer: 'yes', amountNok: 200000 } })).status(),
  ).toBe(200)
  expect((await subscription(me)).wants_info).toBe(true)
  await api.dispose()
})

test('a plain member and the board alone get the 404 on the committee page', async ({ browser }) => {
  for (const key of ['member', 'board', 'invest-3']) {
    const api = await apiAs(key)
    expect((await api.get(`/api/member/invest/${SLUG}/komite`)).status(), key).toBe(404)
    const body = await (await api.get(`/api/member/invest/${SLUG}`)).json()
    expect(body.committee, key).toBeUndefined()
    expect(body.sessionSignups, key).toBeUndefined()
    await api.dispose()
  }
  const { page, close } = await view(browser, 'member', PHONE)
  await page.goto(`/member/invest/${SLUG}/komite`)
  await expect(page.getByText('Fant ikke denne siden.')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: /Påmeldt nettmøte/ })).toHaveCount(0)
  await expect(page.getByText('Komitésiden')).toHaveCount(0)
  await close()
})

test('the committee sees who signed up and every answer, with the totals', async ({ browser }) => {
  // The member asks for a session (and has not answered); invest-3 has said yes.
  const m = await apiAs('member')
  expect((await m.post(`/api/member/invest/${SLUG}/session`, { data: { note: NOTE } })).status()).toBe(200)
  await m.dispose()

  for (const key of ['committee-board', 'committee-only']) {
    const api = await apiAs(key)
    const res = await api.get(`/api/member/invest/${SLUG}/komite`)
    expect(res.status(), key).toBe(200)
    const body = await res.json()
    const signup = body.sessionSignups.find((r: any) => r.name === persona('member').name)
    expect(signup.note).toBe(NOTE)
    expect(signup.email).toMatch(/@/)
    expect(signup.answer).toBeNull()
    const answer = body.answers.find((r: any) => r.name === persona('invest-3').name)
    expect(answer).toMatchObject({ answer: 'yes', amountNok: 200000, wantsInfo: true })
    // The same numbers as `invest-offering.mjs show`.
    const [c] = (await db()`
      SELECT count(*) FILTER (WHERE phase = 'interest' AND interest_level = 'yes')::int   AS yes,
             count(*) FILTER (WHERE phase = 'interest' AND interest_level = 'maybe')::int AS maybe,
             count(*) FILTER (WHERE phase = 'declined')::int AS no,
             coalesce(sum(amount_nok) FILTER (WHERE phase = 'interest' AND interest_level = 'yes'), 0)::bigint AS yes_nok
      FROM invest_subscriptions WHERE offering_id = ${offeringId}`) as any[]
    expect(body.totals).toEqual({ yes: c.yes, yesNok: Number(c.yes_nok), maybe: c.maybe, no: c.no })
    // The offering page only says how many, for the link.
    const page = await (await api.get(`/api/member/invest/${SLUG}`)).json()
    expect(page.committee.sessionSignups).toBe(body.sessionSignups.length)
    expect(page.sessionSignups).toBeUndefined()
    await api.dispose()
  }

  for (const [label, size] of [
    ['desktop', DESKTOP],
    ['phone', PHONE],
  ] as const) {
    const { page, errors, close } = await view(browser, 'committee-board', size)
    // From the offering page: the link near the top, and the one line where the list was.
    await page.goto(`/member/invest/${SLUG}`)
    const link = page.locator('.committee-link')
    await expect(link).toContainText('Komitésiden', { timeout: 20_000 })
    await expect(page.locator('#invest-session-list')).toHaveCount(0)
    await expect(page.getByText(/Se listen på komitésiden/)).toBeVisible()
    if (label === 'desktop') {
      // The left menu: a sub-item under CTORI 4, for the committee.
      await expect(page.locator('.nav-sub', { hasText: 'Komitésiden' })).toBeVisible()
    }
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/member/invest/${SLUG}/komite$`))

    const list = page.locator('#invest-session-list')
    await expect(list.getByRole('heading', { name: /^Påmeldt nettmøte \(\d+\)$/ })).toBeVisible({ timeout: 20_000 })
    await expect(list.getByRole('button', { name: 'Kopier alle e-poster' })).toBeVisible()
    await expect(list.getByText(NOTE)).toBeVisible()
    const answers = page.locator('#invest-answers')
    await expect(answers.getByRole('heading', { name: /^Svarene \(\d+\)$/ })).toBeVisible()
    await expect(answers.getByText(persona('invest-3').name)).toBeVisible()
    if (label === 'desktop') await expect(answers.getByRole('columnheader', { name: 'Vil vite mer' })).toBeVisible()
    // Nothing runs off the side on a phone.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, label).toBeLessThanOrEqual(1)
    // The whole page in one frame (a fullPage capture of the fixed layout dims the fold).
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.setViewportSize({ width: size.width, height: Math.max(size.height, height) })
    // Real members' names, e-mails and notes stay out of the published screenshot.
    await shot(page, `${DIR}/3-komite-${label}.png`, [
      page.locator('.email'),
      page.locator('textarea'),
      page.locator('tr.signup td:not(:last-child), li.signup > *:not(:first-child)'),
      page.locator('.signup .font-weight-bold'),
      page.locator('tr.answer-row td:first-child, tr.answer-row td:nth-child(4), li.answer-row .font-weight-bold'),
      page.locator('.answer-row .text, .answer-row .line'),
    ])
    expect(errors).toEqual([])
    await close()
  }
})
