import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  setHeader: vi.fn(),
  logClientError: vi.fn(),
  sanitize: vi.fn((value: string) => value),
  newCorrelationId: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
}))

vi.mock('../lib/logging', () => ({
  logClientError: mocks.logClientError,
  sanitize: mocks.sanitize,
  newCorrelationId: mocks.newCorrelationId,
}))

import { callRpc } from './rpc'

describe('callRpc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('conserva exactamente los argumentos declarados en la firma SQL', async () => {
    mocks.setHeader.mockResolvedValue({ data: { ok: true }, error: null })
    mocks.rpc.mockReturnValue({ setHeader: mocks.setHeader })

    const result = await callRpc('approve_template', { p_template_id: 'template-1' })

    expect(mocks.rpc).toHaveBeenCalledWith('approve_template', {
      p_template_id: 'template-1',
    })
    expect(mocks.setHeader).toHaveBeenCalledWith(
      'x-correlation-id', '00000000-0000-4000-8000-000000000001',
    )
    expect(result.data).toEqual({ ok: true })
    expect(result.correlationId).toBe('00000000-0000-4000-8000-000000000001')
  })

  it('registra errores con el correlation id sin sustituirlos por éxito', async () => {
    mocks.setHeader.mockResolvedValue({
      data: null,
      error: { message: 'RPC no disponible' },
    })
    mocks.rpc.mockReturnValue({ setHeader: mocks.setHeader })

    const result = await callRpc('approve_template', { p_template_id: 'template-1' })

    expect(result.error?.message).toContain('Referencia: 00000000-0000-4000-8000-000000000001')
    expect(result.data).toBeNull()
    expect(mocks.logClientError).toHaveBeenCalledWith(expect.objectContaining({
      correlationId: '00000000-0000-4000-8000-000000000001',
    }))
  })
})
