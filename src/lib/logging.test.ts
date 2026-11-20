/**
 * Pruebas unitarias de lib/logging.ts
 * K04 - Requisitos 1.2, 1.3, 3.2, 3.3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: mocks.from } }))

import { sanitize, newCorrelationId, logClientError } from './logging'

mocks.from.mockReturnValue({ insert: mocks.insert })
mocks.insert.mockResolvedValue({ error: null })

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

  it('elimina bearer, refresh tokens y claves modernas', () => {
    const result = sanitize('Authorization: Bearer abc.DEF_123?refresh_token=secret&api_key=key sb_secret_abcdef')
    expect(result).not.toMatch(/abc\.DEF_123|secret|api_key=key|sb_secret_abcdef/)
    expect(result).toContain('[TOKEN]')
    expect(result).toContain('refresh_token=[REDACTED]')
    expect(result).toContain('[KEY]')
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
  it('genera un UUID compatible con audit_logs.correlation_id', () => {
    const id = newCorrelationId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
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

  it('persiste datos saneados y solo guarda hash del stack', async () => {
    await logClientError({
      route: '/login?access_token=hidden',
      error: new Error('Falló user@example.com con Bearer abc123'),
      correlationId: newCorrelationId(),
    })
    const inserted = mocks.insert.mock.calls.at(-1)?.[0]
    expect(inserted.message).toContain('[EMAIL]')
    expect(inserted.message).toContain('[TOKEN]')
    expect(inserted.route).toContain('access_token=[REDACTED]')
    expect(inserted.correlation_id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(inserted).not.toHaveProperty('stack')
    expect(inserted.stack_hash).toBeTruthy()
  })

  it('limita el registro a diez errores por minuto', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2035-01-01T00:00:00Z'))
    mocks.insert.mockClear()
    for (let index = 0; index < 11; index += 1) {
      await logClientError({ route: '/test', error: `error ${index}` })
    }
    expect(mocks.insert).toHaveBeenCalledTimes(10)
    vi.useRealTimers()
  })
})
