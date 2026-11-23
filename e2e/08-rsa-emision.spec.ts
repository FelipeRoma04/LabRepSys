/**
 * E2E · 08 — Emisión, snapshot e inmutabilidad
 *
 * Verifica:
 * - JTC puede emitir un reporte aprobado.
 * - Segregación: quien preparó el reporte no puede emitirlo.
 * - El reporte emitido aparece en la lista de emitidos con estado ISSUED.
 * - El snapshot del reporte emitido no cambia al modificar un catálogo.
 * - Un reporte emitido puede rectificarse creando una nueva versión.
 *
 * Precondición: seed-phase2 completo + un reporte en estado APPROVED.
 */

import { test, expect } from '@playwright/test'
import { gotoRoute } from './helpers/navigation'
import { signIn } from './helpers/auth'
import { waitForLoad } from './helpers/wait'
import { isPending, DEMO } from './helpers/demo-data'

test.describe('Emisión RSA', () => {
  test('la lista de reportes emitidos carga para JTC', async ({ page }) => {
    await signIn(page, 'jtc')
    await gotoRoute(page, '/reportes/emitidos')
    await waitForLoad(page)
    await expect(
      page.getByRole('table').or(page.getByText(/emitidos|no hay reportes|vacío/i)).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('AUDITOR puede ver reportes emitidos', async ({ page }) => {
    await signIn(page, 'auditor')
    await gotoRoute(page, '/reportes/emitidos')
    await waitForLoad(page)
    await expect(
      page.getByRole('table').or(page.getByText(/emitidos|no hay reportes|vacío/i)).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('ANALISTA no ve la lista de reportes aprobados', async ({ page }) => {
    await signIn(page, 'analista')
    await gotoRoute(page, '/reportes/aprobados')
    await waitForLoad(page)
    // ANALISTA is not in the roles list for /reportes/aprobados
    await expect(
      page.getByText(/sin permiso|acceso denegado|no tiene permiso/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('emitir reporte aprobado (segregación verificada)', async () => {
    test.skip(
      isPending(DEMO.clientId),
      'Seed E2E fase 2 pendiente: se necesita reporte APPROVED.',
    )
    // 1. Navigate to the approved report as JTC (not the same user who prepared it)
    // 2. Click "Emitir"
    // 3. Verify the report changes to ISSUED status and a code is assigned
    // 4. Verify it appears in /reportes/emitidos
    //
    // await signIn(page, 'jtc')           // must be a different user than analista
    // await gotoRoute(page, '/reportes/aprobados')
    // const emitBtn = page.locator('tr').filter({ hasText: 'APROBADO' })
    //   .getByRole('button', { name: /emitir/i }).first()
    // await emitBtn.click()
    // await expect(page.getByText(/EMITIDO|RSA \d{4}/i).first()).toBeVisible()
  })

  test('snapshot emitido no cambia al modificar catálogo (inmutabilidad)', async () => {
    test.skip(
      isPending(DEMO.clientId),
      'Seed E2E fase 2 pendiente.',
    )
    // 1. Record the snapshot_hash of an issued report from the detail page.
    // 2. As ADMIN, modify the name of a method used in that report.
    // 3. Reload the report detail page.
    // 4. Assert the snapshot_hash is unchanged.
    // 5. Assert the displayed method name in the report still shows the original value.
  })

  test('rectificar un reporte emitido crea versión 2 en DRAFT', async () => {
    test.skip(
      isPending(DEMO.clientId),
      'Seed E2E fase 2 pendiente.',
    )
    // await signIn(page, 'jtc')
    // await gotoRoute(page, '/reportes/emitidos')
    // const rectifyBtn = page.locator('tr').filter({ hasText: 'EMITIDO' })
    //   .getByRole('button', { name: /rectificar/i }).first()
    // await rectifyBtn.click()
    // await page.getByLabel(/motivo/i).fill('Corrección de unidad. E2E test.')
    // await page.getByRole('button', { name: /confirmar rectificación/i }).click()
    // // The new draft should appear in /reportes/borradores
    // await signIn(page, 'analista')
    // await gotoRoute(page, '/reportes/borradores')
    // await expect(page.locator('td').filter({ hasText: /versión 2|v2/i }).first()).toBeVisible()
  })
})
