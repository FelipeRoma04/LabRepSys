/**
 * Servicio de resultados: importaciones, carga y correcciones.
 * p07
 */
import { supabase } from '../lib/supabase'
import { callRpc } from './rpc'
import type { Result, ResultImport, ImportRow, ReconciliationIssue } from '../types/results'

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

export async function createImport(payload: Partial<ResultImport>): Promise<ResultImport> {
  const { data, error } = await db()
    .from('result_imports')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as ResultImport
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

export async function confirmImportRow(rowId: string, testId: string): Promise<void> {
  const { error } = await db()
    .from('import_rows')
    .update({ confirmed: true, mapped_test_id: testId, mapping_status: 'CONFIRMED' })
    .eq('id', rowId)
  if (error) throw error
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

export async function createResult(payload: Partial<Result>): Promise<Result> {
  const { data, error } = await db()
    .from('results')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as Result
}

/** Corrección con motivo obligatorio */
export async function correctResult(
  resultId: string,
  newData: Partial<Result>,
  reason: string,
): Promise<void> {
  if (!reason.trim()) throw new Error('El motivo de corrección es obligatorio.')

  // Obtener dato actual para old_data
  const { data: current, error: fetchErr } = await db()
    .from('results')
    .select('*')
    .eq('id', resultId)
    .single()
  if (fetchErr) throw fetchErr

  // Registrar corrección
  const { error: corrErr } = await db()
    .from('result_corrections')
    .insert({ result_id: resultId, old_data: current, new_data: newData, reason })
  if (corrErr) throw corrErr

  // Aplicar cambio
  const { error: updErr } = await db()
    .from('results')
    .update({ ...newData, status: 'CORRECTED' })
    .eq('id', resultId)
  if (updErr) throw updErr
}

// ── Resultados pendientes ─────────────────────────────────────────────────────

export interface PendingResult {
  sample_id: string
  test_id: string
  laboratory_id: string
}

/** Resultados pendientes: ensayos sin resultado, para /resultados/pendientes */
export async function listPendingResults(): Promise<PendingResult[]> {
  // Vista futura — cuando exista sample_tests (p04). Retorna vacío por ahora.
  return []
}

// ── Conciliación ──────────────────────────────────────────────────────────────

export async function listIssues(sampleId?: string): Promise<ReconciliationIssue[]> {
  let q = db()
    .from('reconciliation_issues')
    .select('*')
    .order('created_at', { ascending: false })
  if (sampleId) q = q.eq('sample_id', sampleId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as ReconciliationIssue[]
}

export async function resolveIssue(
  issueId: string,
  decision: string,
  reason: string,
  selectedValue?: string,
): Promise<void> {
  if (!reason.trim()) throw new Error('El motivo es obligatorio para resolver una inconsistencia.')
  const { error } = await db()
    .from('reconciliation_decisions')
    .insert({ issue_id: issueId, decision, reason, selected_value: selectedValue })
  if (error) throw error
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
