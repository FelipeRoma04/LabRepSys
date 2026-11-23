/**
 * Shared page-level wait utilities.
 */

import type { Page } from '@playwright/test'

/** Wait for the app's loading spinner to disappear. */
export async function waitForLoad(page: Page): Promise<void> {
  // The app renders <LoadingState> components that contain aria-label="Cargando"
  // or the text "Cargando". Wait for them to vanish, with a generous timeout.
  await page.waitForFunction(
    () => !document.querySelector('[aria-label*="argando"]') && !document.querySelector('.loading-state'),
    { timeout: 20_000 },
  ).catch(() => {
    // If the selector was never present, that is fine — the page loaded instantly.
  })
}

/** Wait for a success notice banner to appear. */
export async function waitForNotice(page: Page, text?: string): Promise<void> {
  const locator = text
    ? page.locator(`.notice, [role="status"]`).filter({ hasText: text })
    : page.locator(`.notice-success, [role="status"]`)
  await locator.first().waitFor({ state: 'visible', timeout: 15_000 })
}

/** Wait for an error state banner. */
export async function waitForError(page: Page, text?: string): Promise<void> {
  const locator = text
    ? page.locator(`.notice-error, [role="alert"]`).filter({ hasText: text })
    : page.locator(`.notice-error, [role="alert"]`)
  await locator.first().waitFor({ state: 'visible', timeout: 15_000 })
}
