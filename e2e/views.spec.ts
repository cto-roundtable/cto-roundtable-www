import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { PERSONAS } from './support/personas'
import { cookiesFor, overviewSlugs, personas, RUN_DIR } from './support/run'

// What each persona SEES: one walk through the portal per persona, a
// full-page screenshot of every stop and a video of the whole walk. Nothing is
// clicked that writes. The shots land in .run/views/<persona>/ with a
// manifest the report builds from; the video is in the Playwright report.
//
// E2E_PAGES=/member,/member/caser narrows the walk; E2E_AS=<email> adds an
// ad-hoc persona ("what does this exact person see").

const PAGES = (
  process.env.E2E_PAGES ??
  [
    '/member',
    '/member/caser',
    '/member/updates',
    '/member/komite',
    '/member/board',
    '/member/discounts',
    '/member/surveys',
    '/member/jobb',
    '/member/sweden',
  ].join(',')
).split(',')

const keys = process.env.E2E_AS ? [...PERSONAS.map((p) => p.key), 'as'] : PERSONAS.map((p) => p.key)

for (const key of keys) {
  test(`views: ${key}`, async ({ page, context, baseURL }) => {
    test.setTimeout(240_000)
    const p = personas().find((x) => x.key === key)!
    await context.addCookies(cookiesFor(p))
    const dir = `${RUN_DIR}/views/${key}`
    mkdirSync(dir, { recursive: true })

    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    // The first case and the first investor update this persona can open, if any.
    const extra: string[] = []
    const deals = await page.request.get(`${baseURL}/api/member/deals`, { failOnStatusCode: false })
    if (deals.ok()) {
      const first = overviewSlugs(await deals.json())[0]
      if (first) extra.push(`/member/caser/${first}`)
    }
    const updates = await page.request.get(`${baseURL}/api/member/updates`, { failOnStatusCode: false })
    if (updates.ok()) {
      const first = ((await updates.json()).companies ?? [])[0]
      if (first?.slug) extra.push(`/member/updates/${first.slug}`)
    }

    const stops: { path: string; url: string; title: string; heading: string; nav: string[]; shot: string }[] = []
    for (const path of [...PAGES, ...extra]) {
      await test.step(path, async () => {
        await page.goto(path)
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
        // The layout shows a spinner until the session is known; wait it out.
        await page
          .locator('.v-progress-circular')
          .first()
          .waitFor({ state: 'hidden', timeout: 10_000 })
          .catch(() => {})
        const shot = `${String(stops.length).padStart(2, '0')}-${path.replace(/^\/member\/?/, '').replace(/\//g, '_') || 'home'}.jpg`
        await page.screenshot({ path: `${dir}/${shot}`, fullPage: true, type: 'jpeg', quality: 55 })
        stops.push({
          path,
          url: page.url().replace(baseURL ?? '', ''),
          title: await page.title(),
          heading: (
            (await page
              .locator('h1, h2')
              .first()
              .textContent({ timeout: 1_000 })
              .catch(() => '')) ?? ''
          ).trim(),
          nav: (await page.locator('nav a, .v-navigation-drawer a, .v-list-item-title').allTextContents())
            .map((t) => t.trim())
            .filter(Boolean),
          shot,
        })
      })
    }
    writeFileSync(`${dir}/manifest.json`, JSON.stringify({ persona: p, stops, errors }, null, 2))
    expect.soft(errors, `${key}: uncaught page errors`).toEqual([])
  })
}
