import { beforeEach, describe, expect, it, vi } from 'vitest'
import { correctResult, findDuplicateImport } from './results'

const query = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => query),
  },
}))

describe('servicio de resultados', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
  })

  it('busca una importación por muestra, laboratorio y hash para evitar duplicados', async () => {
    const existingImport = { id: 'import-1', sample_id: 'sample-1', laboratory_id: 'lab-1' }
    query.maybeSingle.mockResolvedValue({ data: existingImport, error: null })

    await expect(findDuplicateImport('sample-1', 'lab-1', 'a'.repeat(64)))
      .resolves.toEqual(existingImport)

    expect(query.select).toHaveBeenCalledWith('*')
    expect(query.eq).toHaveBeenNthCalledWith(1, 'sample_id', 'sample-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'laboratory_id', 'lab-1')
    expect(query.eq).toHaveBeenNthCalledWith(3, 'file_hash', 'a'.repeat(64))
  })

  it('rechaza una corrección sin motivo antes de intentar escribir', async () => {
    await expect(correctResult('result-1', { reported_text: '7' }, '  '))
      .rejects.toThrow('El motivo de corrección es obligatorio.')
  })
})
