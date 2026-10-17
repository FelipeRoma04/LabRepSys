/**
 * Servicio para el asistente de migración y calidad de datos.
 * K05 — Requisitos 1.1–3.2
 *
 * Solo lectura desde el asistente. Las correcciones se hacen con los
 * servicios existentes de cada módulo.
 */
import { supabase } from '../lib/supabase'
import { callRpc } from './rpc'

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LegacyMapping {
  id: string
  legacy_code: string
  legacy_source: 'AGQ' | 'CHEM' | 'SGI'
  proposed_test_id: string | null
  status: 'PROPOSED' | 'CONFIRMED' | 'REJECTED'
  decided_by: string | null
  decided_at: string | null
  reason: string | null
  created_at: string
}

export interface UnmappedLegacyCode {
  legacy_source: string | null
  legacy_name: string | null
  alias_id: string
  test_id: string
  sa_code: string
  parameter_name: string | null
  needs_mapping: boolean
}

export interface QualityClientIssue {
  id: string
  business_name: string
  nit: string | null
  active: boolean
  issue_type: string
  correction_path: string
}

export interface QualityTestIssue {
  id: string
  code: string
  parameter_name: string | null
  active: boolean
  missing_fields: string[]
  correction_path: string
}

export interface QualitySummaryRow {
  category: string
  total_issues: number
}

// ─── Mapeos de códigos heredados ──────────────────────────────────────────────

export async function listLegacyMappings(): Promise<LegacyMapping[]> {
  const { data, error } = await db()
    .from('legacy_code_mappings')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as LegacyMapping[]
}

export async function listUnmappedLegacyCodes(): Promise<UnmappedLegacyCode[]> {
  const { data, error } = await db()
    .from('v_unmapped_legacy_codes')
    .select('*')
    .eq('needs_mapping', true)
    .order('legacy_source')
  if (error) throw error
  return (data ?? []) as UnmappedLegacyCode[]
}

export async function confirmLegacyMapping(
  mappingId: string,
  decision: 'CONFIRMED' | 'REJECTED',
  reason?: string,
): Promise<{ ok: boolean; error_code?: string; message?: string }> {
  const result = await callRpc<{ ok: boolean; error_code?: string; message?: string }>(
    'confirm_legacy_mapping',
    {
      p_mapping_id: mappingId,
      p_decision: decision,
      p_reason: reason ?? null,
    },
  )
  if (result.error) return { ok: false, message: result.error.message }
  return result.data ?? { ok: false, message: 'Sin respuesta.' }
}

export async function createProposedMapping(
  legacyCode: string,
  legacySource: 'AGQ' | 'CHEM' | 'SGI',
  proposedTestId: string | null,
): Promise<void> {
  const { error } = await db()
    .from('legacy_code_mappings')
    .insert({
      legacy_code: legacyCode,
      legacy_source: legacySource,
      proposed_test_id: proposedTestId,
      status: 'PROPOSED',
    })
  if (error) throw error
}

// ─── Calidad de datos ─────────────────────────────────────────────────────────

export async function listQualityClientIssues(): Promise<QualityClientIssue[]> {
  const { data, error } = await db()
    .from('v_quality_clients')
    .select('*')
    .order('business_name')
  if (error) throw error
  return (data ?? []) as QualityClientIssue[]
}

export async function listQualityTestIssues(): Promise<QualityTestIssue[]> {
  const { data, error } = await db()
    .from('v_quality_tests')
    .select('*')
    .order('code')
  if (error) throw error
  return (data ?? []) as QualityTestIssue[]
}

export async function getQualitySummary(): Promise<QualitySummaryRow[]> {
  const { data, error } = await db()
    .from('v_quality_summary')
    .select('*')
  if (error) throw error
  return (data ?? []) as QualitySummaryRow[]
}

// ─── Exportación CSV ──────────────────────────────────────────────────────────

/**
 * Convierte un array de objetos a CSV seguro contra inyección de fórmulas.
 * Req 2.3: prefija celdas que comiencen con =, +, -, @ con una comilla simple.
 */
export function rowsToCsv(headers: string[], rows: string[][]): string {
  const escape = (cell: string): string => {
    const safe = cell.replace(/"/g, '""')
    // Protección contra inyección de fórmulas Excel
    const formulaChars = ['=', '+', '-', '@', '\t', '\r']
    if (formulaChars.some((c) => safe.startsWith(c))) {
      return `"'${safe}"`
    }
    if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
      return `"${safe}"`
    }
    return safe
  }
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ]
  return lines.join('\r\n')
}
