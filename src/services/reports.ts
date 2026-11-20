/**
 * Servicio de reportes RSA.
 * p11, p12
 */
import { supabase } from '../lib/supabase'
import { callRpc } from './rpc'
import { createStorageSignedUrl } from './storage'
import type { Report, ReportStatus, TransitionResult } from '../types/reports'

function db() {
  if (!supabase) throw new Error('Supabase no configurado.')
  return supabase
}

export async function listReports(statusFilter?: ReportStatus[]): Promise<Report[]> {
  let q = db().from('reports').select('*').order('updated_at', { ascending: false })
  if (statusFilter?.length) q = q.in('status', statusFilter)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Report[]
}

export async function getReport(id: string): Promise<Report | null> {
  const { data, error } = await db().from('reports').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Report | null
}

export async function createReport(payload: Partial<Report>): Promise<Report> {
  const { data, error } = await db().from('reports').insert(payload).select().single()
  if (error) throw error
  return data as Report
}

export async function transitionReport(
  reportId: string,
  toStatus: ReportStatus,
  comment?: string,
): Promise<TransitionResult> {
  const result = await callRpc<TransitionResult>('transition_report', {
    p_report_id: reportId,
    p_to_status: toStatus,
    p_comment: comment ?? null,
  })
  if (result.error) return { ok: false, message: result.error.message }
  return result.data ?? { ok: false, message: 'Sin respuesta.' }
}

export async function issueReport(reportId: string): Promise<TransitionResult & { code?: string }> {
  const result = await callRpc<TransitionResult & { code?: string }>('issue_report', {
    p_report_id: reportId,
  })
  if (result.error) return { ok: false, message: result.error.message }
  return result.data ?? { ok: false }
}

export async function rectifyReport(
  reportId: string,
  reason: string,
): Promise<TransitionResult & { new_report_id?: string }> {
  if (!reason.trim()) throw new Error('El motivo de rectificación es obligatorio.')
  const result = await callRpc<TransitionResult & { new_report_id?: string }>('rectify_report', {
    p_report_id: reportId,
    p_reason: reason,
  })
  if (result.error) return { ok: false, message: result.error.message }
  return result.data ?? { ok: false }
}

export async function getSnapshot(reportId: string) {
  const { data, error } = await db()
    .from('report_snapshots')
    .select('*')
    .eq('report_id', reportId)
    .maybeSingle()
  if (error) throw error
  return data
}

export interface ReportFileRow {
  id: string
  report_id: string
  file_type: 'DRAFT_PDF' | 'FINAL_PDF'
  storage_path: string
  sha256: string
  created_at: string
}

export async function listReportFiles(reportId: string): Promise<ReportFileRow[]> {
  const { data, error } = await db().from('report_files')
    .select('id, report_id, file_type, storage_path, sha256, created_at')
    .eq('report_id', reportId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ReportFileRow[]
}

export async function uploadFinalReportPdf(reportId: string, file: File): Promise<ReportFileRow> {
  if (file.type !== 'application/pdf' && !file.name.toLocaleLowerCase().endsWith('.pdf')) {
    throw new Error('Selecciona un archivo PDF.')
  }
  if (!globalThis.crypto?.subtle) throw new Error('Este navegador no permite calcular SHA-256 en un contexto seguro.')
  const bytes = await file.arrayBuffer()
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
  const safeName = file.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120) || 'reporte.pdf'
  const storagePath = `reports/${reportId}/${globalThis.crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await db().storage.from('issued-reports').upload(storagePath, file, {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (uploadError) throw uploadError

  const result = await callRpc<{ ok: boolean; file_id?: string; message?: string }>('register_issued_report_file', {
    p_report_id: reportId,
    p_storage_path: storagePath,
    p_sha256: sha256,
  })
  if (result.error || !result.data?.ok) {
    await db().storage.from('issued-reports').remove([storagePath])
    throw result.error ?? new Error(result.data?.message ?? 'No se pudo registrar el PDF final.')
  }

  const row = (await listReportFiles(reportId)).find((item) => item.id === result.data?.file_id)
  if (!row) throw new Error('El PDF se subió, pero no se pudo recuperar el registro del archivo.')
  return row
}

export async function getFinalReportPdfUrl(path: string): Promise<string> {
  return createStorageSignedUrl('issued-reports', path)
}
