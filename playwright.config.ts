import { defineConfig } from '@playwright/test'

// Persona e2e for the member portal: see e2e/README.md. Runs against a preview
// server on a Neon branch, never production (e2e/support/guard.ts refuses).
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.run/test-results',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  workers: 4,
  reporter: [['list'], ['html', { outputFolder: './e2e/.run/report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3311',
    viewport: { width: 1280, height: 860 },
    video: { mode: 'on', size: { width: 1280, height: 860 } },
    trace: 'retain-on-failure',
    locale: 'nb-NO',
  },
})
