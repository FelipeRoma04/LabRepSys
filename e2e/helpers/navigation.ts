import type { Page } from '@playwright/test'

/** Navega dentro del HashRouter, conservando el subdirectorio de GitHub Pages. */
export async function gotoRoute(page: Page, route = '/'): Promise<void> {
  const target = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:5173/')
  target.hash = route.startsWith('/') ? route : '/' + route
  await page.goto(target.toString())
}
