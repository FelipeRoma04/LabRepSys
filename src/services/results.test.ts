import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  correctResult,
  detectReconciliationIssues,
  findDuplicateImport,
  resolveIssue,
} from './results'

const query = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => query),
    rpc: query.rpc,
  },
}))

describe('servicio de resultados', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.rpc.mockReset()
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

  it('valida el motivo y la respuesta de la RPC al resolver una inconsistencia', async () => {
    await expect(resolveIssue('issue-1', 'ACCEPT_A', '  ', null, null))
      .rejects.toThrow('El motivo es obligatorio para resolver una inconsistencia.')
    expect(query.rpc).not.toHaveBeenCalled()

    query.rpc.mockResolvedValue({ data: { ok: true, status: 'RESOLVED' }, error: null })
    await expect(resolveIssue(
      'issue-1',
      'ACCEPT_A',
      'Validado con evidencia de recepción',
      'Recepción',
      '2026-05-29',
    )).resolves.toBe('RESOLVED')
    expect(query.rpc).toHaveBeenCalledWith('resolve_reconciliation_issue', {
      target_issue_id: 'issue-1',
      selected_decision: 'ACCEPT_A',
      selected_source: 'Recepción',
      selected_value: '2026-05-29',
      decision_reason: 'Validado con evidencia de recepción',
      mapped_test_id: null,
    })
  })

  it('rechaza un total de detección con tipo incorrecto', async () => {
    query.rpc.mockResolvedValue({ data: '3', error: null })
    await expect(detectReconciliationIssues('sample-1'))
      .rejects.toThrow('La respuesta del servidor no contiene un total válido de inconsistencias.')
    expect(query.rpc).toHaveBeenCalledWith('detect_reconciliation_issues', {
      target_sample_id: 'sample-1',
    })
  })
})
