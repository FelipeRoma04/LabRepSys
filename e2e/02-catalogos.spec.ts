/**
 * E2E · 02 — Catálogos
 *
 * Verifica que los catálogos sembrados en seed-phase1 se muestran en la UI:
 * - La página de ensayos lista al menos un ensayo SA.
 * - La página de matrices lista la matriz AP.
 * - La página de laboratorios lista Sierra Alta.
 * - Un usuario AUDITOR puede ver los catálogos pero no tiene botón de crear.
 */

import { test, expect } from '@playwright/test'
import { gotoRoute } from './helpers/navigation'
import { signIn } from './helpers/auth'
import { waitForLoad } from './helpers/wait'

test.describe('Catálogos (seed-phase1)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'admin')
  })

  test('ensayos: lista al menos un ensayo SA', async ({ page }) => {
    await gotoRoute(page, '/catalogos/ensayos')
    await waitForLoad(page)
    // The table should have rows with SA codes
    await expect(
      page.locator('td, .data-cell').filter({ hasText: /^SA/ }).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('matrices: lista la matriz AP', async ({ page }) => {
    await gotoRoute(page, '/catalogos/matrices')
    await waitForLoad(page)
    await expect(
      page.locator('td, .data-cell').filter({ hasText: 'AP' }).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('laboratorios: lista Sierra Alta', async ({ page }) => {
    await gotoRoute(page, '/catalogos/laboratorios')
    await waitForLoad(page)
    await expect(
      page.locator('td, .data-cell').filter({ hasText: /Sierra Alta/i }).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('AUDITOR puede ver ensayos pero no ve botón de agregar', async ({ page }) => {
    await signIn(page, 'auditor')
    await gotoRoute(page, '/catalogos/ensayos')
    await waitForLoad(page)

    // Should see the data table
    await expect(
      page.locator('td, .data-cell').filter({ hasText: /^SA/ }).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Should NOT see a create/add button
    await expect(
      page.getByRole('button', { name: /nuevo|agregar|crear/i }),
    ).toHaveCount(0)
  })
})
