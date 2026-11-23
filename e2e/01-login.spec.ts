/**
 * E2E · 01 — Login y control de acceso
 *
 * Verifica:
 * - Login con credenciales inválidas muestra error.
 * - Login con credenciales válidas (ADMIN) redirige al dashboard.
 * - Ruta protegida redirige a login si no hay sesión.
 * - Logout elimina la sesión.
 */

import { test, expect } from '@playwright/test'
import { gotoRoute } from './helpers/navigation'
import { signIn, signOut } from './helpers/auth'

test.describe('Login y control de acceso', () => {
  test('muestra error con contraseña incorrecta', async ({ page }) => {
    await gotoRoute(page, '/')
    await page.waitForURL(/.*/)

    // Si ya hay sesión activa, saltar
    if (!page.url().includes('login') && !page.url().includes('#')) {
      test.skip()
    }

    await page.getByLabel(/correo|email/i).fill('no-existe@test.com')
    await page.getByLabel(/contraseña|password/i).fill('mal')
    await page.getByRole('button', { name: /iniciar sesión/i }).click()

    await expect(
      page.getByRole('alert').or(page.locator('.error-state, .notice-error')).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('login con ADMIN redirige al dashboard', async ({ page }) => {
    await signIn(page, 'admin')
    await gotoRoute(page, '/')
    await expect(page).not.toHaveURL(/login/)
    // Dashboard debe mostrar algún encabezado o bienvenida
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 })
  })

  test('ruta protegida sin sesión redirige a login', async ({ page }) => {
    // Navegar sin inyectar sesión
    await gotoRoute(page, '/muestras')
    // Debe redirigir o mostrar pantalla de login / acceso denegado
    await expect(
      page.getByRole('button', { name: /iniciar sesión/i })
        .or(page.getByText(/acceso denegado|inicia sesión|no autorizado/i))
        .first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('logout elimina la sesión', async ({ page }) => {
    await signIn(page, 'admin')
    await gotoRoute(page, '/')
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 })

    await signOut(page)
    await page.reload()

    await expect(
      page.getByRole('button', { name: /iniciar sesión/i })
        .or(page.getByText(/iniciar sesión|no autorizado/i))
        .first(),
    ).toBeVisible({ timeout: 15_000 })
  })
})
