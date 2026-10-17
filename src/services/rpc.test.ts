import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  logClientError: vi.fn(),
  newCorrelationId: vi.fn(() => 'cid-test'),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
}))

vi.mock('../lib/logging', () => ({
  logClientError: mocks.logClientError,
  newCorrelationId: mocks.newCorrelationId,
}))

import { callRpc } from './rpc'

describe('callRpc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('conserva exactamente los argumentos declarados en la firma SQL', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null })

    const result = await callRpc('approve_template', { p_template_id: 'template-1' })

    expect(mocks.rpc).toHaveBeenCalledWith('approve_template', {
      p_template_id: 'template-1',
    })
    expect(result.data).toEqual({ ok: true })
    expect(result.correlationId).toBe('cid-test')
  })

  it('registra errores con el correlation id sin sustituirlos por éxito', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'RPC no disponible' },
    })

    const result = await callRpc('approve_template', { p_template_id: 'template-1' })

    expect(result.error?.message).toBe('RPC no disponible')
    expect(result.data).toBeNull()
    expect(mocks.logClientError).toHaveBeenCalledWith(expect.objectContaining({
      correlationId: 'cid-test',
    }))
  })
})
