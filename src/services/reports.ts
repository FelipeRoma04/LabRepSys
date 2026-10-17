/**
 * Servicio de reportes RSA.
 * p11, p12
 */
import { supabase } from '../lib/supabase'
import { callRpc } from './rpc'
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
