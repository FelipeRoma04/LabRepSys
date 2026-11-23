/**
 * Demo data IDs used across E2E tests.
 *
 * These values are populated by the seed script in
 * `supabase/seed/` (seed-phase1 worktree) and by any additional
 * test-data fixtures in `e2e/fixtures/`.
 *
 * When seed-phase2 (clients, samples, results) is complete, fill in
 * the PENDING placeholders below with the real UUIDs from the test project.
 *
 * IMPORTANT: These are IDs for the TEST project only.
 * Never use production IDs or real client data.
 */

export const DEMO = {
  /** Client created by e2e fixture */
  clientId: process.env.E2E_DEMO_CLIENT_ID ?? 'PENDING',
  /** Contact for the demo client */
  contactId: process.env.E2E_DEMO_CONTACT_ID ?? 'PENDING',
  /** Active quote linked to the demo client */
  quoteId: process.env.E2E_DEMO_QUOTE_ID ?? 'PENDING',
  /** Sample code — must match the pattern in app_settings */
  sampleCode: 'AG9901',
  /** Matrix code (from seed) */
  matrixCode: 'AP',
  /** Internal laboratory code (from seed) */
  laboratoryCode: 'SA',
  /** One SA test code from seed */
  testCode: 'SA-001',
  /** External laboratory for subcontracted test */
  externalLabCode: 'SA1',
} as const

export function isPending(id: string): boolean {
  return id === 'PENDING'
}
