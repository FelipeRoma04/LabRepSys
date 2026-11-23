/**
 * Authentication helpers for E2E tests.
 *
 * Uses Supabase Auth REST API directly (not through the UI) to obtain a
 * session token, then stores it in localStorage so the app picks it up
 * immediately without having to go through the login form in every test.
 *
 * This keeps tests fast and isolates auth from UI login tests.
 */

import type { Page } from '@playwright/test'

export type RoleKey = 'admin' | 'analista' | 'jtc' | 'recepcion' | 'auditor'

interface Credentials {
  email: string
  password: string
}

function creds(role: RoleKey): Credentials {
  const e = (key: string) => {
    const v = process.env[key]
    if (!v) throw new Error(`Missing env var ${key}. Set it in .env.e2e (never commit credentials).`)
    return v
  }
  const map: Record<RoleKey, [string, string]> = {
    admin:    ['E2E_ADMIN_EMAIL',     'E2E_ADMIN_PASSWORD'],
    analista: ['E2E_ANALISTA_EMAIL',  'E2E_ANALISTA_PASSWORD'],
    jtc:      ['E2E_JTC_EMAIL',       'E2E_JTC_PASSWORD'],
    recepcion:['E2E_RECEPCION_EMAIL', 'E2E_RECEPCION_PASSWORD'],
    auditor:  ['E2E_AUDITOR_EMAIL',   'E2E_AUDITOR_PASSWORD'],
  }
  const [emailKey, pwKey] = map[role]
  return { email: e(emailKey), password: e(pwKey) }
}

/**
 * Sign in via Supabase Auth REST API and inject the session into the page's
 * localStorage. Call this before navigating to any protected route.
 */
export async function signIn(page: Page, role: RoleKey): Promise<void> {
  const supabaseUrl = process.env.E2E_SUPABASE_URL
  const anonKey     = process.env.E2E_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new Error('E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY must be set.')
  }

  const { email, password } = creds(role)

  const response = await page.request.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      data: { email, password },
    },
  )

  if (!response.ok()) {
    const body = await response.text()
    throw new Error(`Auth failed for role "${role}" (${response.status()}): ${body}`)
  }

  const session = await response.json() as {
    access_token: string
    refresh_token: string
    expires_at: number
    user: { id: string }
  }

  // Supabase JS v2 stores the session under this key
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      window.localStorage.setItem(key, value)
    },
    { key: storageKey, value: JSON.stringify(session) },
  )
}

/**
 * Sign out by clearing the auth storage key and reloading.
 */
export async function signOut(page: Page): Promise<void> {
  const supabaseUrl = process.env.E2E_SUPABASE_URL ?? ''
  const storageKey = `sb-${new URL(supabaseUrl || 'https://placeholder.supabase.co').hostname.split('.')[0]}-auth-token`
  await page.evaluate((key: string) => window.localStorage.removeItem(key), storageKey)
}
