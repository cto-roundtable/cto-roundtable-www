import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { apiAs, db } from './support/meeting'
import { cookiesFor, persona, RUN_DIR } from './support/run'

// A pensjonist asks to become an active member again (server/utils/rejoin.ts, Snorre
// 2026-11-06), as the `retired` persona: a pensjonist from the Norwegian chapter in no
// SPV (Frede-like). They sign in to a two-item portal (Oversikt, Innlogging), apply on
// the overview, and the application lands as a pending join_request to cto-roundtable
// for the board. One open application at a time; a member cannot apply; nothing else
// of the portal opens. The board mail is attempted for every active styret member
// (the preview's Resend key is a dummy, so none is delivered).

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const WHY = 'Ny CTO-rolle i et scaleup fra januar, og jeg har tid til samlingene igjen. E2E-test.'
const requestIds: string[] = []

test.beforeAll(async () => {
  // The branch is a copy of production: start from no open application for this persona.
  await db()`DELETE FROM join_requests WHERE person_id = ${persona('retired').personId} AND status = 'pending'`
})

test.afterAll(async () => {
  if (requestIds.length) await db()`DELETE FROM join_requests WHERE id = ANY(${requestIds})`
})

test('page: a pensjonist sees Oversikt and Innlogging, applies, and sees it is sent', async ({ browser }) => {
  mkdirSync(`${RUN_DIR}/rejoin`, { recursive: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'nb-NO' })
  await ctx.addCookies(cookiesFor(persona('retired')))
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => {
    if (r.url().includes('/api/member/') && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`)
  })

  await page.goto('/member')
  await expect(page.getByRole('heading', { name: 'Bli aktiv igjen' })).toBeVisible({ timeout: 15_000 })
  const nav = page.locator('.v-navigation-drawer .v-list-item-title')
  await expect(nav).toHaveText(['Oversikt', 'Innlogging'])
  await page.screenshot({ path: `${RUN_DIR}/rejoin/1-overview.png`, fullPage: true })

  // Too short: the button waits for a real answer.
  const box = page.getByLabel('Hvorfor vil du tilbake?')
  await box.fill('Kort')
  await expect(page.getByRole('button', { name: 'Send søknad til styret' })).toBeDisabled()

  await box.fill(WHY)
  const posted = page.waitForResponse((r) => r.url().endsWith('/api/member/rejoin') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Send søknad til styret' }).click()
  const res = await posted
  expect(res.status()).toBe(200)
  const body = await res.json()
  requestIds.push(body.pending.id)
  await expect(page.getByText('Søknaden er sendt')).toBeVisible()
  await page.screenshot({ path: `${RUN_DIR}/rejoin/2-sent.png`, fullPage: true })

  // Back after a reload: still sent, no form.
  await page.reload()
  await expect(page.getByText('Søknaden er sendt')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Send søknad til styret' })).toHaveCount(0)

  // Any other member page goes to the overview without mounting (no 403s on the way).
  await page.goto('/member/caser')
  await expect(page).toHaveURL(/\/member$/)
  await page.goto('/member/jobb')
  await expect(page).toHaveURL(/\/member$/)

  expect(errors).toEqual([])
  await ctx.close()
})

test('the application is a pending join_request to the chapter, for the board', async () => {
  const [row] = (await db()`
    SELECT jr.status, jr.why_join, jr.source, jr.internal_notes, ng.slug
    FROM join_requests jr JOIN network_groups ng ON ng.id = jr.group_id
    WHERE jr.id = ${requestIds[0]}
  `) as any[]
  expect(row).toMatchObject({ status: 'pending', why_join: WHY, source: 'form', slug: 'cto-roundtable' })
  expect(row.internal_notes).toMatch(/^Rejoin:/)
  // The person is untouched: the board decides.
  const [p] = (await db()`SELECT status FROM persons WHERE id = ${persona('retired').personId}`) as any[]
  expect(p.status).toBe('retired')
})

test('API: one open application at a time, a real answer, pensjonister only', async () => {
  const retired = await apiAs('retired')
  const again = await retired.post('/api/member/rejoin', { data: { why: WHY }, failOnStatusCode: false })
  expect(again.status()).toBe(409)
  expect((await again.json()).data?.code).toBe('pending')
  const state = await (await retired.get('/api/member/rejoin')).json()
  expect(state).toMatchObject({ canApply: true, pending: { id: requestIds[0] } })

  // A pensjonist in an SPV can apply too; the answer must be a real one.
  const investor = await apiAs('retired-investor-3')
  expect((await (await investor.get('/api/member/rejoin')).json()).canApply).toBe(true)
  for (const why of ['', 'for kort', 'x'.repeat(2001), 42]) {
    const res = await investor.post('/api/member/rejoin', { data: { why }, failOnStatusCode: false })
    expect(res.status(), JSON.stringify(why).slice(0, 20)).toBe(400)
  }

  // An active member has nothing to apply for.
  const member = await apiAs('member')
  expect((await (await member.get('/api/member/rejoin')).json()).canApply).toBe(false)
  const refused = await member.post('/api/member/rejoin', { data: { why: WHY }, failOnStatusCode: false })
  expect(refused.status()).toBe(403)

  // Nothing written by the refused and the invalid attempts.
  const rows = (await db()`
    SELECT person_id FROM join_requests
    WHERE status = 'pending' AND person_id = ANY(${[persona('member').personId, persona('retired-investor-3').personId]})
      AND created_at > NOW() - interval '10 minutes'
  `) as any[]
  expect(rows).toEqual([])
  for (const a of [retired, investor, member]) await a.dispose()
})
