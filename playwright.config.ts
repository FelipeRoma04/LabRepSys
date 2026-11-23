/**
 * Playwright E2E configuration — LabRepSys (A03)
 *
 * Target: GitHub Pages deploy  https://feliperoma04.github.io/LabRepSys/
 * Local:  Run `npm run dev` and set E2E_BASE_URL=http://localhost:5173
 *
 * Required env vars (never commit real values):
 *   E2E_BASE_URL            — base URL of the app under test
 *   E2E_SUPABASE_URL        — Supabase project URL for the TEST project
 *   E2E_SUPABASE_ANON_KEY   — anon key of the test project
 *   E2E_ADMIN_EMAIL         — ADMIN user email (test project)
 *   E2E_ADMIN_PASSWORD      — ADMIN user password
 *   E2E_ANALISTA_EMAIL      — ANALISTA user email
 *   E2E_ANALISTA_PASSWORD   — ANALISTA user password
 *   E2E_JTC_EMAIL           — JEFE_TECNICA_CALIDAD user email
 *   E2E_JTC_PASSWORD        — JEFE_TECNICA_CALIDAD user password
 *   E2E_RECEPCION_EMAIL     — RECEPCION user email
 *   E2E_RECEPCION_PASSWORD  — RECEPCION user password
 *   E2E_AUDITOR_EMAIL       — AUDITOR user email
 *   E2E_AUDITOR_PASSWORD    — AUDITOR user password
 */

import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,       // sequential: tests share DB state in test project
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'e2e-report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
})
