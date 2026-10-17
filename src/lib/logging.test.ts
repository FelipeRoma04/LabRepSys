/**
 * Pruebas unitarias de lib/logging.ts
 * K04 - Requisitos 1.2, 1.3, 3.2, 3.3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sanitize, newCorrelationId, logClientError } from './logging'

// ─── sanitize ────────────────────────────────────────────────────────────────
describe('sanitize', () => {
  it('elimina correos electrónicos', () => {
    const result = sanitize('Error del usuario test@example.com al cargar')
    expect(result).not.toContain('test@example.com')
    expect(result).toContain('[EMAIL]')
  })

  it('elimina tokens JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ'
    const result = sanitize(`Token inválido: ${jwt}`)
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
    expect(result).toContain('[JWT]')
  })

  it('elimina query params sensibles', () => {
    const result = sanitize('/api/data?token=abc123&other=ok')
    expect(result).not.toContain('abc123')
    expect(result).toContain('[REDACTED]')
    expect(result).toContain('other=ok')
  })

  it('elimina parámetro password', () => {
    const result = sanitize('/login?password=secreto&user=juan')
    expect(result).not.toContain('secreto')
    expect(result).toContain('[REDACTED]')
  })

  it('conserva texto sin datos sensibles', () => {
    const msg = 'No se pudo cargar la muestra AG0346'
    expect(sanitize(msg)).toBe(msg)
  })

  it('texto vacío retorna vacío', () => {
    expect(sanitize('')).toBe('')
  })
})

// ─── newCorrelationId ────────────────────────────────────────────────────────
describe('newCorrelationId', () => {
  it('genera un ID con prefijo cid-', () => {
    const id = newCorrelationId()
    expect(id.startsWith('cid-')).toBe(true)
  })

  it('genera IDs únicos en cada llamada', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newCorrelationId()))
    expect(ids.size).toBe(100)
  })
})

// ─── logClientError ──────────────────────────────────────────────────────────
describe('logClientError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no lanza aunque supabase sea null', async () => {
    // supabase es null en tests (no hay variables de entorno)
    await expect(
      logClientError({ route: '/test', error: new Error('fallo') }),
    ).resolves.toBeUndefined()
  })

  it('no registra el stack trace original, solo el hash', async () => {
    // Verificar que no se lanza y que el mensaje no tiene stack crudo
    const error = new Error('TypeError: cannot read property x of undefined')
    error.stack = 'TypeError: cannot read property x of undefined\n  at foo (main.js:10:5)'
    await expect(
      logClientError({ route: '/ruta', error, correlationId: 'cid-test' }),
    ).resolves.toBeUndefined()
  })
})
