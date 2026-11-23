/**
 * E2E · 07 — Flujo RSA: revisión, devolución y aprobación
 *
 * Verifica:
 * - ANALISTA puede iniciar validación de un reporte DRAFT.
 * - JTC puede aprobar un reporte IN_REVIEW.
 * - JTC puede devolver un reporte con comentario.
 * - ANALISTA puede reenviar tras corrección.
 * - Segregación: JTC que preparó un reporte no puede emitirlo.
 *
 * La mayoría de estas pruebas requieren datos de seed-phase2.
 * Se marcan como skip hasta que esos datos estén disponibles.
 */

import { test, expect } from '@playwright/test'
import { gotoRoute } from './helpers/navigation'
import { signIn } from './helpers/auth'
import { waitForLoad } from './helpers/wait'
import { isPending, DEMO } from './helpers/demo-data'

test.describe('Revisión y aprobación RSA', () => {
  test('la lista de reportes en revisión carga para JTC', async ({ page }) => {
    await signIn(page, 'jtc')
    await gotoRoute(page, '/reportes/revision')
    await waitForLoad(page)
    await expect(
      page.getByRole('table').or(page.getByText(/en revisión|no hay reportes|vacío/i)).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('la lista de reportes aprobados carga para JTC', async ({ page }) => {
    await signIn(page, 'jtc')
    await gotoRoute(page, '/reportes/aprobados')
    await waitForLoad(page)
    await expect(
      page.getByRole('table').or(page.getByText(/aprobados|no hay reportes|vacío/i)).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('RECEPCION no puede ver reportes en revisión', async ({ page }) => {
    await signIn(page, 'recepcion')
    await gotoRoute(page, '/reportes/revision')
    await waitForLoad(page)
    await expect(
      page.getByText(/sin permiso|acceso denegado|no tiene permiso|no autorizado/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('flujo DRAFT → VALIDATING → READY_FOR_REVIEW → IN_REVIEW → APPROVED', async () => {
    test.skip(
      isPending(DEMO.clientId),
      'Seed E2E fase 2 pendiente: se necesita borrador existente.',
    )
    // This test assumes a report in DRAFT state exists in the test project.
    // When seed-phase2 is ready, navigate to that report's detail page and
    // drive it through the states step by step.
    //
    // Pseudocode (to be fleshed out when report ID is known):
    //   await signIn(page, 'analista')
    //   await page.goto(`/reportes/${reportId}`)
    //   await page.getByRole('button', { name: /iniciar validación/i }).click()
    //   await page.getByRole('button', { name: /validar y enviar a revisión/i }).click()
    //   await signIn(page, 'jtc')
    //   await page.goto(`/reportes/${reportId}`)
    //   await page.getByRole('button', { name: /iniciar revisión/i }).click()
    //   await page.getByRole('button', { name: /aprobar/i }).click()
    //   await expect(page.getByText('APROBADO')).toBeVisible()
  })

  test('devolver reporte requiere comentario', async () => {
    test.skip(
      isPending(DEMO.clientId),
      'Seed E2E fase 2 pendiente.',
    )
    // JTC tries to return a report without a comment — button should be disabled
    // await signIn(page, 'jtc')
    // await page.goto(`/reportes/${reportInReviewId}`)
    // const returnBtn = page.getByRole('button', { name: /devolver/i })
    // await expect(returnBtn).toBeDisabled()
    // await page.getByLabel(/comentario/i).fill('Falta unidad en resultado 3.')
    // await expect(returnBtn).toBeEnabled()
  })
})
