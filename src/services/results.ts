/**
 * Servicios de resultados, importaciones y conciliación.
 */
import { supabase } from '../lib/supabase'
import { callRpc } from './rpc'
import { listSamples } from './samples'
import type {
  ImportRow,
  PendingResult,
  Result,
  ResultCorrection,
  ResultImport,
  ResultImportRowDraft,
  ResultLoadOptions,
  ReconciliationDecision,
  ReconciliationIssue,
  ReconciliationOptions,
} from '../types/results'

function db() {
  if (!supabase) throw new Error('Supabase no configurado.')
  return supabase
}

// ── Importaciones ─────────────────────────────────────────────────────────────

export async function listImports(sampleId: string): Promise<ResultImport[]> {
  const { data, error } = await db()
    .from('result_imports')
    .select('*')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ResultImport[]
}

export async function findDuplicateImport(
  sampleId: string,
  laboratoryId: string,
  fileHash: string,
): Promise<ResultImport | null> {
  const { data, error } = await db()
    .from('result_imports')
    .select('*')
    .eq('sample_id', sampleId)
    .eq('laboratory_id', laboratoryId)
    .eq('file_hash', fileHash)
    .maybeSingle()
  if (error) throw error
  return data as ResultImport | null
}

export async function getResultLoadOptions(): Promise<ResultLoadOptions> {
  const [samples, laboratories, tests, aliases] = await Promise.all([
    listSamples(),
    db()
      .from('laboratories')
      .select('id, code, name')
      .eq('active', true)
      .order('name'),
    db()
      .from('tests')
      .select('id, code, parameter_name')
      .eq('active', true)
      .order('code'),
    db()
      .from('test_aliases')
      .select('test_id, laboratory_id, external_name')
      .eq('active', true)
      .eq('alias_type', 'EXTERNAL_NAME')
      .not('external_name', 'is', null),
  ])
  if (laboratories.error) throw laboratories.error
  if (tests.error) throw tests.error
  if (aliases.error) throw aliases.error
  return {
    samples: samples.map((sample) => ({
      id: sample.id,
      code: sample.code,
      client_name: sample.client?.business_name ?? 'Cliente sin nombre',
    })),
    laboratories: laboratories.data ?? [],
    tests: tests.data ?? [],
    aliases: aliases.data ?? [],
  }
}

export async function saveResultImport(
  payload: Record<string, unknown>,
  rows: ResultImportRowDraft[],
): Promise<{ importId: string; duplicate: boolean }> {
  const { data, error } = await db().rpc('save_result_import', {
    import_payload: payload,
    rows_payload: rows,
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || !('import_id' in data) ||
    typeof data.import_id !== 'string' || !('duplicate' in data) ||
    typeof data.duplicate !== 'boolean') {
    throw new Error('La respuesta del servidor no contiene una importación válida.')
  }
  return { importId: data.import_id, duplicate: data.duplicate }
}

export async function setResultImportStatus(
  importId: string,
  status: ResultImport['import_status'],
): Promise<void> {
  const { error } = await db().rpc('set_result_import_status', {
    target_import_id: importId,
    target_status: status,
  })
  if (error) throw error
}

// ── Filas de importación ──────────────────────────────────────────────────────

export async function listImportRows(importId: string): Promise<ImportRow[]> {
  const { data, error } = await db()
    .from('import_rows')
    .select('*')
    .eq('result_import_id', importId)
    .order('row_number')
  if (error) throw error
  return (data ?? []) as ImportRow[]
}

export async function confirmImportRow(
  rowId: string,
  testId: string,
  resultPayload: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await db().rpc('confirm_result_import_row', {
    target_import_row_id: rowId,
    target_test_id: testId,
    result_payload: resultPayload,
  })
  if (error) throw error
  return data as string
}

// ── Resultados ────────────────────────────────────────────────────────────────

export async function listResults(sampleId: string): Promise<Result[]> {
  const { data, error } = await db()
    .from('results')
    .select('*')
    .eq('sample_id', sampleId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as Result[]
}

export async function listResultCorrections(resultId: string): Promise<ResultCorrection[]> {
  const { data, error } = await db()
    .from('result_corrections')
    .select('*')
    .eq('result_id', resultId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ResultCorrection[]
}

export async function correctResult(
  resultId: string,
  newData: Partial<Result>,
  reason: string,
): Promise<string> {
  if (!reason.trim()) throw new Error('El motivo de corrección es obligatorio.')
  const { data, error } = await db().rpc('record_result_correction', {
    target_result_id: resultId,
    corrected_data: newData,
    correction_reason: reason,
  })
  if (error) throw error
  return data as string
}

// ── Resultados pendientes ─────────────────────────────────────────────────────

export async function listPendingResults(): Promise<PendingResult[]> {
  const [tests, results] = await Promise.all([
    db()
      .from('sample_tests')
      .select(`
        id, sample_id, test_id, execution_type, assigned_laboratory_id,
        sample:samples(code, client:clients(business_name)),
        test:tests(code, parameter_name, laboratory_id, laboratory:laboratories(name)),
        laboratory:laboratories(id, name)
      `),
    db().from('results').select('sample_id, test_id, laboratory_id, status'),
  ])
  if (tests.error) throw tests.error
  if (results.error) throw results.error

  return (tests.data ?? []).flatMap((row) => {
    const sample = Array.isArray(row.sample) ? row.sample[0] : row.sample
    const test = Array.isArray(row.test) ? row.test[0] : row.test
    const assignedLaboratory = Array.isArray(row.laboratory) ? row.laboratory[0] : row.laboratory
    const testLaboratory = test
      ? Array.isArray(test.laboratory) ? test.laboratory[0] : test.laboratory
      : null
    const client = sample
      ? Array.isArray(sample.client) ? sample.client[0] : sample.client
      : null
    if (!sample || !test) return []
    const laboratoryId = row.assigned_laboratory_id ?? test.laboratory_id ?? null
    const hasResult = (results.data ?? []).some((result) =>
      result.sample_id === row.sample_id &&
      result.test_id === row.test_id &&
      result.status !== 'REJECTED' &&
      (laboratoryId === null || result.laboratory_id === laboratoryId),
    )
    if (hasResult) return []
    return [{
      sample_id: row.sample_id,
      sample_code: sample.code,
      client_name: client?.business_name ?? 'Cliente sin nombre',
      sample_test_id: row.id,
      test_id: row.test_id,
      test_code: test.code,
      parameter_name: test.parameter_name,
      laboratory_id: laboratoryId,
      laboratory_name: assignedLaboratory?.name ?? testLaboratory?.name ?? null,
    }]
  })
}

// ── Conciliación ──────────────────────────────────────────────────────────────

export async function listIssues(sampleId?: string): Promise<ReconciliationIssue[]> {
  let q = db()
    .from('reconciliation_issues')
    .select('*, sample:samples(code), decisions:reconciliation_decisions(*)')
    .order('created_at', { ascending: false })
  if (sampleId) q = q.eq('sample_id', sampleId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as ReconciliationIssue[]
}

export async function getReconciliationOptions(): Promise<ReconciliationOptions> {
  const [samples, tests] = await Promise.all([
    db().from('samples').select('id, code').order('code'),
    db().from('tests').select('id, code, parameter_name').eq('active', true).order('code'),
  ])
  if (samples.error) throw samples.error
  if (tests.error) throw tests.error
  return {
    samples: samples.data ?? [],
    tests: tests.data ?? [],
  }
}

export async function detectReconciliationIssues(sampleId: string): Promise<number> {
  const { data, error } = await db().rpc('detect_reconciliation_issues', {
    target_sample_id: sampleId,
  })
  if (error) throw error
  if (typeof data !== 'number' || !Number.isInteger(data) || data < 0) {
    throw new Error('La respuesta del servidor no contiene un total válido de inconsistencias.')
  }
  return data
}

export async function resolveIssue(
  issueId: string,
  decision: ReconciliationDecision,
  reason: string,
  selectedSource: string | null,
  selectedValue: string | null,
  mappedTestId?: string | null,
): Promise<'OPEN' | 'RESOLVED'> {
  if (!reason.trim()) throw new Error('El motivo es obligatorio para resolver una inconsistencia.')
  const { data, error } = await db().rpc('resolve_reconciliation_issue', {
    target_issue_id: issueId,
    selected_decision: decision,
    selected_source: selectedSource,
    selected_value: selectedValue,
    decision_reason: reason,
    mapped_test_id: mappedTestId ?? null,
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || !('ok' in data) || data.ok !== true ||
    !('status' in data) || (data.status !== 'OPEN' && data.status !== 'RESOLVED')) {
    throw new Error('La respuesta del servidor no confirma una decisión de conciliación válida.')
  }
  return data.status
}

// ── Validaciones ──────────────────────────────────────────────────────────────

export async function runValidations(entityType: string, entityId: string): Promise<{ runId: string }> {
  const result = await callRpc<string>('run_validations', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  })
  if (result.error) throw result.error
  return { runId: result.data ?? '' }
}
