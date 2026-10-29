import { expect, type Page, test } from '@playwright/test'

// The signed-out login card. The passkey autofill (conditional UI) starts on load,
// not on anything the visitor did, so however it fails the card must not greet
// them with "Innlogging med passkey fungerte ikke". The error is for a passkey
// attempt the visitor started: the button, or a passkey picked from autofill.
//
// No cookie, no persona: this is what anyone who opens /member sees.

const OPTIONS = '**/api/auth/passkey/login/options'

async function openLogin(page: Page) {
  const options = page.waitForResponse((r) => r.url().endsWith('/api/auth/passkey/login/options'), {
    timeout: 15_000,
  })
  await page.goto('/member')
  await expect(page.getByRole('heading', { name: 'Medlemsportal' })).toBeVisible({ timeout: 15_000 })
  // The autofill request is under way (headless Chromium offers conditional UI);
  // wait for it to settle so a late error would already be on the page.
  await options
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
}

test('login: no passkey error on load, as served', async ({ page }) => {
  await openLogin(page)
  await expect(page.locator('.v-alert')).toHaveCount(0)
})

test('login: no passkey error on load when the passkey options request fails', async ({ page }) => {
  await page.route(OPTIONS, (route) => route.fulfill({ status: 500, body: '{}' }))
  await openLogin(page)
  await expect(page.locator('.v-alert')).toHaveCount(0)
})

test('login: the passkey button still reports a failed attempt', async ({ page }) => {
  await page.route(OPTIONS, (route) => route.fulfill({ status: 500, body: '{}' }))
  await openLogin(page)
  await page.getByRole('button', { name: /passkey/i }).click()
  await expect(page.locator('.v-alert')).toContainText('Innlogging med passkey fungerte ikke')
})
