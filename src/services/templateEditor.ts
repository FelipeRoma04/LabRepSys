/**
 * Servicio para el editor de plantillas de reporte.
 * K03 — Requisitos 1.1–4.2
 */
import { supabase } from '../lib/supabase'
import { callRpc } from './rpc'
import type { TemplateConfig } from '../types/templateConfig'

function requireSupabase() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

export interface TemplateRow {
  id: string
  code: string
  version: number
  status: 'DRAFT' | 'APPROVED' | 'RETIRED'
  approval_date: string | null
  approved_by: string | null
  approved_at: string | null
  configuration: TemplateConfig
  active: boolean
  created_at: string
  updated_at: string
}

/** Lista todas las plantillas activas */
export async function listTemplates(): Promise<TemplateRow[]> {
  const { data, error } = await requireSupabase()
    .from('report_templates')
    .select('*')
    .eq('active', true)
    .order('code', { ascending: true })
    .order('version', { ascending: false })
  if (error) throw error
  return (data ?? []) as TemplateRow[]
}

/** Lista solo las plantillas APPROVED (para el constructor RSA) */
export async function listApprovedTemplates(): Promise<TemplateRow[]> {
  const { data, error } = await requireSupabase()
    .from('report_templates')
    .select('*')
    .eq('status', 'APPROVED')
    .eq('active', true)
    .order('code', { ascending: true })
  if (error) throw error
  return (data ?? []) as TemplateRow[]
}

/** Guarda la configuración de un DRAFT */
export async function saveTemplateDraft(
  id: string,
  configuration: TemplateConfig,
): Promise<void> {
  const { data, error } = await requireSupabase()
    .from('report_templates')
    .update({ configuration })
    .eq('id', id)
    .eq('status', 'DRAFT')
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('La plantilla ya no está en estado borrador o no tiene permiso para editarla.')
}

/** Aprueba una plantilla — solo JEFE_TECNICA_CALIDAD */
export async function approveTemplate(
  id: string,
): Promise<{ ok: boolean; message?: string }> {
  const result = await callRpc<{ ok: boolean; error_code?: string; message?: string }>(
    'approve_template',
    { p_template_id: id },
  )
  if (result.error) return { ok: false, message: result.error.message }
  return result.data ?? { ok: false, message: 'Sin respuesta del servidor.' }
}

/** Crea una nueva versión DRAFT a partir de una plantilla aprobada */
export async function newTemplateVersion(
  id: string,
): Promise<{ ok: boolean; newId?: string; message?: string }> {
  const result = await callRpc<{ ok: boolean; new_id?: string; error_code?: string; message?: string }>(
    'new_template_version',
    { p_template_id: id },
  )
  if (result.error) return { ok: false, message: result.error.message }
  const d = result.data
  if (!d) return { ok: false, message: 'Sin respuesta del servidor.' }
  return { ok: d.ok, newId: d.new_id, message: d.message }
}

/** Retira una plantilla (RETIRED) */
export async function retireTemplate(id: string): Promise<void> {
  const result = await callRpc<{ ok: boolean; message?: string }>(
    'retire_template',
    { p_template_id: id },
  )
  if (result.error) throw result.error
  if (!result.data?.ok) {
    throw new Error(result.data?.message ?? 'No se pudo retirar la plantilla.')
  }
}

/** Sube un asset (logo, firma) al bucket template-assets */
export async function uploadTemplateAsset(
  templateId: string,
  assetType: 'logo' | 'secondary_logo' | 'signature',
  file: File,
): Promise<string> {
  const client = requireSupabase()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${templateId}/${assetType}_${crypto.randomUUID()}_${safeName}`

  const { error } = await client.storage
    .from('template-assets')
    .upload(path, file)
  if (error) throw error

  return path
}
