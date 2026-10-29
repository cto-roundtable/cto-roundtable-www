import { mkdirSync, writeFileSync } from 'node:fs'
import { type Page, test } from '@playwright/test'
import { cookiesFor, personas, RUN_DIR } from './support/run'

// A tour of the portal as ONE persona, following that persona's own menu rather
// than a fixed list of pages: what the nav offers them, each page on desktop and
// on a phone, and one level of the member pages those pages link to (a survey,
// an offering). Read-only: it follows links, it never presses a button.
//
//   E2E_TOUR=sweden e2e/preview.sh test e2e/tour.spec.ts
//
// Output: .run/tour/<persona>/ with the shots and manifest.json.

const KEY = process.env.E2E_TOUR
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 860 },
  { name: 'phone', width: 390, height: 844 },
]
const MAX_LINKED = 8

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page
    .locator('.v-progress-circular')
    .first()
    .waitFor({ state: 'hidden', timeout: 10_000 })
    .catch(() => {})
}

const memberLinks = (page: Page, scope: string) =>
  page.$$eval(`${scope} a[href^="/member"]`, (as) =>
    as.map((a) => ({ href: a.getAttribute('href') ?? '', text: (a.textContent ?? '').trim().replace(/\s+/g, ' ') })),
  )

test.skip(!KEY, 'set E2E_TOUR=<persona key> to run a tour')

test(`tour: ${KEY}`, async ({ browser, baseURL }) => {
  test.setTimeout(600_000)
  const p = personas().find((x) => x.key === KEY)
  if (!p) throw new Error(`e2e: no persona "${KEY}" (see e2e/support/personas.ts)`)
  const dir = `${RUN_DIR}/tour/${KEY}`
  mkdirSync(dir, { recursive: true })

  // The menu, as the persona's own session renders it.
  const ctx = await browser.newContext({ viewport: VIEWPORTS[0], recordVideo: { dir, size: VIEWPORTS[0] } })
  await ctx.addCookies(cookiesFor(p))
  const page = await ctx.newPage()
  await page.goto('/member')
  await settle(page)
  const nav = (await memberLinks(page, '.v-navigation-drawer')).filter(
    (l, i, all) => l.href && all.findIndex((x) => x.href === l.href) === i,
  )
  const landing = page.url().replace(baseURL ?? '', '')

  // Member pages the menu pages link to, one level down.
  const linked: { href: string; text: string; from: string }[] = []
  const stops: { path: string; label: string; via: string; url: string; heading: string; shots: string[] }[] = []
  const seen = new Set(nav.map((n) => n.href))
  const visit = async (path: string, label: string, via: string) => {
    const shots: string[] = []
    let url = ''
    let heading = ''
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp)
      await page.goto(path)
      await settle(page)
      const shot = `${String(stops.length).padStart(2, '0')}-${vp.name}.jpg`
      await page.screenshot({ path: `${dir}/${shot}`, fullPage: true, type: 'jpeg', quality: 60 })
      shots.push(shot)
      if (vp.name === 'desktop') {
        url = page.url().replace(baseURL ?? '', '')
        heading = (
          (await page
            .locator('main h1, main h2')
            .first()
            .textContent({ timeout: 1_000 })
            .catch(() => '')) ?? ''
        ).trim()
        for (const l of await memberLinks(page, 'main')) {
          const href = l.href.split('#')[0]
          if (!seen.has(href) && linked.length < MAX_LINKED) {
            seen.add(href)
            linked.push({ ...l, href, from: path })
          }
        }
      }
    }
    stops.push({ path, label, via, url, heading, shots })
  }

  for (const n of nav) await test.step(n.href, () => visit(n.href, n.text, 'menu'))
  for (const l of linked) await test.step(l.href, () => visit(l.href, l.text, `linked from ${l.from}`))

  await ctx.close()
  writeFileSync(`${dir}/manifest.json`, JSON.stringify({ persona: p, landing, nav, stops }, null, 2))
})
