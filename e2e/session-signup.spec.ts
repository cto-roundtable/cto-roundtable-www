import { mkdirSync } from 'node:fs'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { apiAs, db } from './support/meeting'
import { cookiesFor, persona, RUN_DIR } from './support/run'

// "Vil du høre mer først?": the online info session sign-up on /member/invest/ctori-4
// (server/utils/investSessions.ts, hq migration 049; Snorre 2026-11-11). Needs 049 on
// the branch. Checks that it is apart from the investment answer (a member who has not
// answered, and one who said no, can sign up, and nothing is written to
// invest_subscriptions), that a member sees only their own, that only the committee
// (never the board alone) gets the list (on /komite since 2026-11-12, committee-page.spec.ts),
// and that undo works. Screens at phone width.
//
// The offering's status is changed ON THE BRANCH only (draft for the committee preview,
// then interest for members) and put back afterwards. Production is never touched.

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const SLUG = 'ctori-4'
const DIR = `${RUN_DIR}/session-signup`
const PHONE = { width: 390, height: 844 }
const NOTE = 'Tirsdag eller torsdag formiddag passer best. E2E-test.'
const touched = ['member', 'invest-3', 'committee-board', 'board'].map((k) => persona(k).personId)
let offeringId = ''
let statusBefore = ''
// invest-3's own answer before the test, put back afterwards (the branch is a copy of production).
let invest3Before: any = null

async function setStatus(status: string) {
  await db()`UPDATE invest_offerings SET status = ${status} WHERE id = ${offeringId}`
}

async function phonePage(
  browser: Browser,
  key: string,
): Promise<{ page: Page; errors: string[]; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ viewport: PHONE, locale: 'nb-NO', isMobile: true, hasTouch: true })
  await ctx.addCookies(cookiesFor(persona(key)))
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { page, errors, close: () => ctx.close() }
}

async function subscriptionRows(personId: string) {
  return (await db()`SELECT phase, interest_level, wants_info FROM invest_subscriptions
                    WHERE offering_id = ${offeringId} AND person_id = ${personId}`) as any[]
}

test.beforeAll(async () => {
  mkdirSync(DIR, { recursive: true })
  const [o] = (await db()`SELECT id, status FROM invest_offerings WHERE slug = ${SLUG}`) as any[]
  offeringId = o.id
  statusBefore = o.status
  ;[invest3Before] = (await db()`SELECT * FROM invest_subscriptions
                                 WHERE offering_id = ${offeringId} AND person_id = ${persona('invest-3').personId}`) as any[]
  await db()`DELETE FROM invest_session_signups WHERE offering_id = ${offeringId} AND person_id = ANY(${touched})`
})

test.afterAll(async () => {
  await db()`DELETE FROM invest_session_signups WHERE offering_id = ${offeringId} AND person_id = ANY(${touched})`
  const p3 = persona('invest-3').personId
  if (!invest3Before)
    await db()`DELETE FROM invest_subscriptions WHERE offering_id = ${offeringId} AND person_id = ${p3}`
  else {
    const b = invest3Before
    await db()`UPDATE invest_subscriptions SET phase = ${b.phase}, interest_level = ${b.interest_level},
                 amount_nok = ${b.amount_nok}, vehicle = ${b.vehicle}, organization_id = ${b.organization_id},
                 wants_info = ${b.wants_info}, wants_to_help = ${b.wants_to_help}, notes = ${b.notes}
               WHERE id = ${b.id}`
  }
  if (statusBefore) await setStatus(statusBefore)
})

test('draft: the committee previews it, a plain member and the board alone get the 404', async ({ browser }) => {
  await setStatus('draft')
  for (const key of ['member', 'board']) {
    const api = await apiAs(key)
    expect((await api.get(`/api/member/invest/${SLUG}`)).status(), key).toBe(404)
    expect((await api.post(`/api/member/invest/${SLUG}/session`, { data: {} })).status(), key).toBe(404)
    await api.dispose()
  }

  const answerBefore = await subscriptionRows(persona('committee-board').personId)
  const { page, errors, close } = await phonePage(browser, 'committee-board')
  await page.goto(`/member/invest/${SLUG}`)
  const heading = page.getByRole('heading', { name: 'Vil du høre mer først?' })
  await expect(heading).toBeVisible({ timeout: 20_000 })
  // First on the page: above the deck and above the answer, and on screen without scrolling.
  const top = (await heading.boundingBox())!.y
  const answer = (await page.getByRole('heading', { name: 'Er du med?' }).boundingBox())!.y
  expect(top).toBeLessThan(answer)
  const deck = page.locator('.doc-card').first()
  if (await deck.count()) expect(top).toBeLessThan((await deck.boundingBox())!.y)
  const button = page.getByRole('button', { name: 'Ja, jeg vil være med på et nettmøte' })
  expect((await button.boundingBox())!.y + 40).toBeLessThan(PHONE.height)
  await expect(
    page.getByText('Ikke forpliktende, og ikke det samme som å melde interesse for å investere.'),
  ).toBeVisible()
  await page.screenshot({ path: `${DIR}/1-committee-preview-top.png` })

  await button.click()
  await expect(page.getByText('Du er med. Vi tar kontakt når vi har funnet en tid.')).toBeVisible()
  // The committee's link to its page now counts the committee member (the list is on /komite).
  await expect(page.getByText('Påmeldt nettmøtet: 1. Se listen på komitésiden.')).toBeVisible()
  await page.screenshot({ path: `${DIR}/2-committee-signed-up.png` })
  expect(await subscriptionRows(persona('committee-board').personId)).toEqual(answerBefore)
  expect(errors).toEqual([])
  await close()
})

test('interest: a member who has not answered signs up, adds a note, and nothing answers for them', async ({
  browser,
}) => {
  await setStatus('interest')
  const me = persona('member')
  const before = await subscriptionRows(me.personId)

  // The banner on /member mentions the meeting (until the member has answered).
  const { page, errors, close } = await phonePage(browser, 'member')
  await page.goto('/member')
  if (!before.length) {
    await expect(page.getByText('eller meld deg på et nettmøte først')).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: `${DIR}/3-member-banner.png` })
  }

  await page.goto(`/member/invest/${SLUG}`)
  await expect(page.getByRole('heading', { name: 'Vil du høre mer først?' })).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${DIR}/4-member-top.png` })
  await page.getByRole('button', { name: 'Ja, jeg vil være med på et nettmøte' }).click()
  await expect(page.getByText('Du er med. Vi tar kontakt når vi har funnet en tid.')).toBeVisible()

  await page.getByRole('button', { name: 'Si gjerne når det passer best' }).click()
  await page.getByLabel('Når passer best? (valgfritt)').fill(NOTE)
  await page.getByRole('button', { name: 'Lagre notatet' }).click()
  await expect(page.getByText(`Notatet ditt: ${NOTE}`)).toBeVisible()
  await page.screenshot({ path: `${DIR}/5-member-signed-up-note.png` })
  // A member sees no list.
  await expect(page.getByRole('heading', { name: /Påmeldt nettmøte/ })).toHaveCount(0)

  // The investment answer is untouched: no row was written for them.
  expect(await subscriptionRows(me.personId)).toEqual(before)

  const api = await apiAs('member')
  const body = await (await api.get(`/api/member/invest/${SLUG}`)).json()
  expect(body.session.note).toBe(NOTE)
  expect(body.sessionSignups).toBeUndefined()
  expect(body.committee).toBeUndefined()
  // At most 280 characters; and only text.
  expect((await api.post(`/api/member/invest/${SLUG}/session`, { data: { note: 'x'.repeat(281) } })).status()).toBe(400)
  expect((await api.post(`/api/member/invest/${SLUG}/session`, { data: { note: 42 } })).status()).toBe(400)
  expect((await api.get(`/api/member/invest/${SLUG}`).then((r) => r.json())).session.note).toBe(NOTE)
  await api.dispose()

  expect(errors).toEqual([])
  await close()
})

test('a member who said no can sign up, and stays a no', async () => {
  const api = await apiAs('invest-3')
  const said = await api.post(`/api/member/invest/${SLUG}/interest`, { data: { answer: 'no' } })
  expect(said.status()).toBe(200)
  const signed = await api.post(`/api/member/invest/${SLUG}/session`, { data: { note: '  ' } })
  expect(signed.status()).toBe(200)
  expect((await signed.json()).session.note).toBeNull()
  const [row] = await subscriptionRows(persona('invest-3').personId)
  expect(row.phase).toBe('declined')
  await api.dispose()
})

test('the committee sees everyone with e-mail and answer; the board alone sees nothing', async ({ browser }) => {
  const board = await apiAs('board')
  const boardBody = await (await board.get(`/api/member/invest/${SLUG}`)).json()
  expect(boardBody.committee).toBeUndefined()
  expect(boardBody.session).toBeNull()
  expect((await board.get(`/api/member/invest/${SLUG}/komite`)).status()).toBe(404)
  await board.dispose()

  const api = await apiAs('committee-board')
  const { sessionSignups } = await (await api.get(`/api/member/invest/${SLUG}/komite`)).json()
  await api.dispose()
  const byName = Object.fromEntries(sessionSignups.map((r: any) => [r.name, r]))
  const m = byName[persona('member').name]
  const n = byName[persona('invest-3').name]
  expect(m.note).toBe(NOTE)
  expect(n.answer).toBe('no')
  expect(n.note).toBeNull()
  for (const r of [m, n]) expect(r.email).toMatch(/@/)
  expect(sessionSignups).toHaveLength(3)

  const { page, errors, close } = await phonePage(browser, 'committee-board')
  await page.goto(`/member/invest/${SLUG}/komite`)
  const list = page.locator('#invest-session-list')
  await expect(list.getByRole('heading', { name: 'Påmeldt nettmøte (3)' })).toBeVisible({ timeout: 20_000 })
  await expect(list.getByText('Svart: nei')).toBeVisible()
  await expect(list.getByText(`«${NOTE}»`)).toBeVisible()
  await expect(list.getByRole('button', { name: 'Kopier alle e-poster' })).toBeVisible()
  await list.scrollIntoViewIfNeeded()
  // Real members' e-mails stay out of the published screenshot.
  await list.screenshot({
    path: `${DIR}/6-committee-list.png`,
    mask: [list.locator('.email'), list.locator('textarea')],
    maskColor: '#333',
  })
  expect(errors).toEqual([])
  await close()
})

test('undo: the member takes themself off, and the row is gone', async ({ browser }) => {
  const { page, errors, close } = await phonePage(browser, 'member')
  await page.goto(`/member/invest/${SLUG}`)
  await page.getByRole('button', { name: 'Meld meg av' }).click({ timeout: 20_000 })
  await expect(page.getByText('Du er meldt av nettmøtet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ja, jeg vil være med på et nettmøte' })).toBeVisible()
  await page.screenshot({ path: `${DIR}/7-member-undone.png` })
  const rows = await db()`SELECT 1 FROM invest_session_signups
                          WHERE offering_id = ${offeringId} AND person_id = ${persona('member').personId}`
  expect(rows).toHaveLength(0)
  expect(errors).toEqual([])
  await close()
})
