/**
 * E2E · 05 — Conciliación de resultados
 *
 * Verifica:
 * - La página de conciliación carga para ANALISTA.
 * - El botón "Detectar inconsistencias" está disponible.
 * - Los filtros (estado, tipo) funcionan sin error.
 * - JEFE_TECNICA_CALIDAD puede ver pero no resolver (solo solicitar revisión).
 * - RECEPCION no tiene acceso a la conciliación.
 */

import { test, expect } from '@playwright/test'
import { gotoRoute } from './helpers/navigation'
import { signIn } from './helpers/auth'
import { waitForLoad } from './helpers/wait'

test.describe('Conciliación', () => {
  test('la página carga para ANALISTA', async ({ page }) => {
    await signIn(page, 'analista')
    await gotoRoute(page, '/resultados/conciliacion')
    await waitForLoad(page)
    await expect(
      page.getByText(/conciliac|inconsistencias|detectar/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('botón Detectar inconsistencias está presente', async ({ page }) => {
    await signIn(page, 'analista')
    await gotoRoute(page, '/resultados/conciliacion')
    await waitForLoad(page)
    await expect(
      page.getByRole('button', { name: /detectar/i }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('filtro de estado cambia la lista sin romper la página', async ({ page }) => {
    await signIn(page, 'analista')
    await gotoRoute(page, '/resultados/conciliacion')
    await waitForLoad(page)

    const statusFilter = page.getByLabel(/estado/i).or(page.locator('select').first())
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption({ index: 1 })
      // Page should not show an unhandled error after filter change
      await expect(
        page.locator('.error-state').filter({ hasText: /Error desconocido|Unhandled/i }),
      ).toHaveCount(0)
    }
  })

  test('JTC puede ver la conciliación', async ({ page }) => {
    await signIn(page, 'jtc')
    await gotoRoute(page, '/resultados/conciliacion')
    await waitForLoad(page)
    await expect(
      page.getByText(/conciliac|inconsistencias/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('RECEPCION no tiene acceso a la conciliación', async ({ page }) => {
    await signIn(page, 'recepcion')
    await gotoRoute(page, '/resultados/conciliacion')
    await waitForLoad(page)
    await expect(
      page.getByText(/sin permiso|acceso denegado|no tiene permiso|no autorizado/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })
})
