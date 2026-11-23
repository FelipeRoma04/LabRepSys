/**
 * E2E · 06 — Constructor RSA: crear y editar borrador
 *
 * Verifica:
 * - ANALISTA puede acceder a "Nuevo borrador RSA".
 * - El formulario valida que haya al menos una muestra seleccionada.
 * - JTC no puede crear borradores (solo revisar).
 * - La lista de borradores muestra los reportes en estado DRAFT.
 *
 * Precondición: seed-phase2 completo (muestras y resultados disponibles).
 * Las pruebas que dependen de datos se marcan con test.skip cuando
 * E2E_DEMO_CLIENT_ID no está configurado.
 */

import { test, expect } from '@playwright/test'
import { gotoRoute } from './helpers/navigation'
import { signIn } from './helpers/auth'
import { waitForLoad } from './helpers/wait'
import { isPending, DEMO } from './helpers/demo-data'

test.describe('Borrador RSA', () => {
  test('ANALISTA puede acceder al formulario de nuevo borrador', async ({ page }) => {
    await signIn(page, 'analista')
    await gotoRoute(page, '/reportes/nuevo')
    await waitForLoad(page)
    await expect(
      page.getByText(/nuevo borrador|borrador RSA|seleccione.*muestras/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('guardar sin muestras muestra error de validación', async ({ page }) => {
    await signIn(page, 'analista')
    await gotoRoute(page, '/reportes/nuevo')
    await waitForLoad(page)

    await page.getByRole('button', { name: /guardar borrador|guardar/i }).click()

    await expect(
      page.getByRole('alert').or(page.locator('.notice-error, .error-state')).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('la lista de borradores carga para ANALISTA', async ({ page }) => {
    await signIn(page, 'analista')
    await gotoRoute(page, '/reportes/borradores')
    await waitForLoad(page)
    // Either shows a table with reports or an empty state — both are valid
    await expect(
      page.getByRole('table').or(page.getByText(/sin borradores|no hay reportes|vacío/i)).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('JTC no puede crear un borrador (sin botón Nuevo)', async ({ page }) => {
    await signIn(page, 'jtc')
    await gotoRoute(page, '/reportes/borradores')
    await waitForLoad(page)
    // JTC should not have a "Nuevo borrador" button
    await expect(
      page.getByRole('button', { name: /nuevo borrador/i }),
    ).toHaveCount(0)
  })

  test('crear borrador con muestra AG9901', async ({ page }) => {
    test.skip(
      isPending(DEMO.clientId),
      'Seed E2E fase 2 pendiente: se necesita muestra y resultado confirmado.',
    )

    await signIn(page, 'analista')
    await gotoRoute(page, '/reportes/nuevo')
    await waitForLoad(page)

    // Select client
    await page.getByLabel(/cliente/i).selectOption({ value: DEMO.clientId })

    // Select the demo sample by code
    const sampleRow = page.locator('tr, .list-item').filter({ hasText: DEMO.sampleCode })
    const sampleCheckbox = sampleRow.locator('input[type="checkbox"]')
    if (await sampleCheckbox.isVisible()) await sampleCheckbox.check()

    // Select first template
    const templateSelect = page.getByLabel(/plantilla/i)
    if (await templateSelect.isVisible()) {
      const options = await templateSelect.locator('option').all()
      if (options.length > 1) await templateSelect.selectOption({ index: 1 })
    }

    await page.getByRole('button', { name: /guardar borrador/i }).click()

    // Should navigate to the report detail page
    await expect(page).toHaveURL(/\/reportes\/[0-9a-f-]{36}/, { timeout: 15_000 })
  })
})
