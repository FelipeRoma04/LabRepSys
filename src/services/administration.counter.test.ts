import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))

import { setCounterFloor } from './administration'

beforeEach(() => vi.clearAllMocks())

describe('setCounterFloor', () => {
  it('llama a la RPC y devuelve el próximo número', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, next_value: 130 }, error: null })
    await expect(setCounterFloor('RSA', 2026, 129)).resolves.toBe(130)
    expect(mocks.rpc).toHaveBeenCalledWith('set_counter_floor', { p_counter_code: 'RSA', p_period_year: 2026, p_last_value: 129 })
  })

  it('valida antes de llamar al servidor', async () => {
    await expect(setCounterFloor('RSA', 2026, -1)).rejects.toThrow(/mayor o igual a 0/)
    await expect(setCounterFloor('RSA', 1999, 5)).rejects.toThrow(/Año/)
    await expect(setCounterFloor(' ', 2026, 5)).rejects.toThrow(/consecutivo/)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('propaga el rechazo del servidor (p. ej. intentar bajar el consecutivo)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('El consecutivo RSA-2026 ya va en 140; no se puede bajar a 129.') })
    await expect(setCounterFloor('RSA', 2026, 129)).rejects.toThrow(/no se puede bajar/)
  })
})
