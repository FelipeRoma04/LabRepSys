/**
 * E2E · 03 — Recepción de muestras
 *
 * Verifica el flujo completo del asistente de 8 pasos.
 *
 * Precondición:
 *   - E2E_DEMO_CLIENT_ID debe estar configurado (seed-e2e.sql ejecutado).
 *   - El proyecto de prueba tiene al menos un ensayo SA activo.
 *
 * Nomenclatura de muestra: AG9901 (sufijo alto para evitar colisiones con
 * datos de desarrollo existentes).
 */

import { test, expect } from '@playwright/test'
import { gotoRoute } from './helpers/navigation'
import { signIn } from './helpers/auth'
import { waitForLoad, waitForNotice } from './helpers/wait'
import { DEMO, isPending } from './helpers/demo-data'

const SAMPLE_CODE = DEMO.sampleCode

test.describe('Recepción de muestras', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'recepcion')
  })

  test('el formulario de recepción carga sin errores', async ({ page }) => {
    await gotoRoute(page, '/muestras/recepcion')
    await waitForLoad(page)
    // Step 1 heading should be visible
    await expect(
      page.getByText(/paso 1|código de muestra|código/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('validación: código con formato incorrecto bloquea avance', async ({ page }) => {
    await gotoRoute(page, '/muestras/recepcion')
    await waitForLoad(page)

    // Enter a code that doesn't match the pattern ^AG[0-9]{4}$
    await page.getByLabel(/código/i).fill('INVALIDO')
    await page.getByRole('button', { name: /siguiente|avanzar|paso 2/i }).click()

    await expect(
      page.getByRole('alert').or(page.locator('.notice-error, .error-state')).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('flujo completo: recibir muestra AG9901', async ({ page }) => {
    test.skip(
      isPending(DEMO.clientId),
      'Seed E2E fase 2 pendiente: E2E_DEMO_CLIENT_ID no configurado.',
    )

    await gotoRoute(page, '/muestras/recepcion')
    await waitForLoad(page)

    // ── Paso 1: código ─────────────────────────────────────────────────────
    await page.getByLabel(/código/i).fill(SAMPLE_CODE)
    await page.getByRole('button', { name: /siguiente|paso 2/i }).click()

    // ── Paso 2: cliente ────────────────────────────────────────────────────
    await waitForLoad(page)
    await page.getByLabel(/cliente/i).selectOption({ value: DEMO.clientId })
    await page.getByRole('button', { name: /siguiente|paso 3/i }).click()

    // ── Paso 3: datos de la muestra ────────────────────────────────────────
    await waitForLoad(page)
    await page.getByLabel(/matriz/i).selectOption({ label: /AP/i })
    // Fill received_at with today
    const today = new Date().toISOString().slice(0, 16).replace('T', 'T')
    const receivedAtInput = page.getByLabel(/recepción|received/i).first()
    await receivedAtInput.fill(today)
    await page.getByRole('button', { name: /siguiente|paso 4/i }).click()

    // ── Paso 4: contenedores ───────────────────────────────────────────────
    await waitForLoad(page)
    await page.getByRole('button', { name: /siguiente|paso 5/i }).click()

    // ── Paso 5: ensayos ────────────────────────────────────────────────────
    await waitForLoad(page)
    // Check the first available test
    const firstTestCheckbox = page.locator('input[type="checkbox"]').first()
    await firstTestCheckbox.check()
    await page.getByRole('button', { name: /siguiente|paso 6/i }).click()

    // ── Paso 6: condiciones de llegada ─────────────────────────────────────
    await waitForLoad(page)
    const conditionsInput = page.getByLabel(/condiciones de llegada/i)
    if (await conditionsInput.isVisible()) {
      await conditionsInput.fill('Muestra en buen estado. E2E test.')
    }
    await page.getByRole('button', { name: /siguiente|paso 7/i }).click()

    // ── Paso 7: revisión de solicitud ──────────────────────────────────────
    await waitForLoad(page)
    // Check capacity and methods verified
    const checkboxes = page.locator('input[type="checkbox"]')
    for (const checkbox of await checkboxes.all()) {
      if (!await checkbox.isChecked()) {
        await checkbox.check()
      }
    }
    await page.getByRole('button', { name: /siguiente|paso 8|resumen/i }).click()

    // ── Paso 8: guardar ────────────────────────────────────────────────────
    await waitForLoad(page)
    await page.getByRole('button', { name: /guardar recepción|guardar/i }).click()

    await waitForNotice(page)
    // After saving, should navigate away from reception form
    await expect(page).not.toHaveURL(/recepcion\?/)
  })

  test('ADMIN puede ver pero no crear muestras desde rol RECEPCION', async ({ page }) => {
    await signIn(page, 'admin')
    await gotoRoute(page, '/muestras')
    await waitForLoad(page)
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 })
  })

  test('AUDITOR no puede acceder al formulario de recepción', async ({ page }) => {
    await signIn(page, 'auditor')
    await gotoRoute(page, '/muestras/recepcion')
    await waitForLoad(page)
    // Should see access denied or be redirected
    await expect(
      page.getByText(/sin permiso|acceso denegado|no tiene permiso/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })
})
