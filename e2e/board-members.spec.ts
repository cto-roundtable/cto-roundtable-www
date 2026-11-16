import { expect, test } from '@playwright/test'
import { cookiesFor, personas } from './support/run'

// The board's member page (/member/activity): pensjonister first, then active
// members, and the search + Vis + Rolle filters narrowing both lists. Reads
// only. Names come from the API, so this runs on whatever the branch holds.

test('board members page: search and filters narrow both lists', async ({ page, context, baseURL }) => {
  const board = personas().find((p) => p.key === 'board')!
  await context.addCookies(cookiesFor(board))

  const api = await (await page.request.get(`${baseURL}/api/member/board/activity`)).json()
  expect(api.former.length, 'the Norwegian chapter has pensjonister').toBeGreaterThan(0)
  const retired = api.former[0]
  const boardMembers = api.members.filter((m: any) => m.roles.includes('Styret'))

  await page.goto('/member/activity')
  const retiredTitle = page.getByRole('heading', { name: /^Pensjonert/ })
  const activeTitle = page.getByRole('heading', { name: /^Aktive medlemmer/ })
  await expect(retiredTitle).toBeVisible()
  await expect(activeTitle).toBeVisible()
  // Pensjonert comes first.
  const [rTop, aTop] = [(await retiredTitle.boundingBox())!.y, (await activeTitle.boundingBox())!.y]
  expect(rTop).toBeLessThan(aTop)

  // Search for one pensjonist: their row stays, the active list has no hit.
  const search = page.getByPlaceholder(/Søk på navn eller rolle/)
  await search.fill(retired.name)
  await expect(page.getByRole('row', { name: new RegExp(retired.name) })).toBeVisible()
  await expect(page.getByText('Ingen treff blant aktive medlemmer.')).toBeVisible()

  // Accent-insensitive: "komite" finds Komité.
  await search.fill('komite')
  await expect(page.getByText('Ingen treff blant aktive medlemmer.')).toHaveCount(0)
  await search.fill('')

  // Vis: Aktive hides the pensjonister, Pensjonert hides the active list.
  await page.getByText('Aktive', { exact: true }).click()
  await expect(retiredTitle).toHaveCount(0)
  await expect(activeTitle).toBeVisible()
  await page.getByText('Pensjonert', { exact: true }).first().click()
  await expect(activeTitle).toHaveCount(0)
  await expect(retiredTitle).toBeVisible()
  await page.getByText('Alle', { exact: true }).first().click()

  // Rolle: Styret leaves exactly the board in the active list.
  await page.getByText('Styret', { exact: true }).first().click()
  await expect(activeTitle).toContainText(`${boardMembers.length} av ${api.members.length}`)
  await page.screenshot({ path: 'e2e/.run/board-members-styret.png', fullPage: true })
})
