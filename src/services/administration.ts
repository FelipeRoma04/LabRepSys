import { supabase } from '../lib/supabase'

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

export interface AdminProfile {
  id: string
  full_name: string | null
  email: string | null
  active: boolean
}

export interface AdminRole {
  code: string
  name: string
}

export interface AssignedRole {
  user_id: string
  role_code: string
}

export interface AppSetting {
  key: string
  value: unknown
  description: string | null
}

export interface PendingDecision {
  id: string
  code: string
  topic: string
  decision_required: string
  suggested_owner: string | null
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  status: 'PENDIENTE' | 'DEFINIDA' | 'DESCARTADA' | 'FUERA_DE_MVP'
  decision_text: string | null
  evidence: string | null
}

export async function listAdminProfiles(): Promise<AdminProfile[]> {
  const { data, error } = await db().from('profiles')
    .select('id, full_name, email, active').order('email')
  if (error) throw error
  return (data ?? []) as AdminProfile[]
}

export async function listAdminRoles(): Promise<AdminRole[]> {
  const { data, error } = await db().from('roles').select('code, name').order('name')
  if (error) throw error
  return (data ?? []) as AdminRole[]
}

export async function listAssignedRoles(): Promise<AssignedRole[]> {
  const { data, error } = await db().from('user_roles').select('user_id, role_code')
  if (error) throw error
  return (data ?? []) as AssignedRole[]
}

export async function setProfileActive(id: string, active: boolean): Promise<void> {
  const { error } = await db().from('profiles').update({ active }).eq('id', id)
  if (error) throw error
}

export async function assignRole(userId: string, roleCode: string, assignedBy: string): Promise<void> {
  const { error } = await db().from('user_roles').insert({
    user_id: userId,
    role_code: roleCode,
    assigned_by: assignedBy,
  })
  if (error) throw error
}

export async function removeRole(userId: string, roleCode: string): Promise<void> {
  const { error } = await db().from('user_roles').delete()
    .eq('user_id', userId).eq('role_code', roleCode)
  if (error) throw error
}

export async function listAppSettings(): Promise<AppSetting[]> {
  const { data, error } = await db().from('app_settings')
    .select('key, value, description').order('key')
  if (error) throw error
  return (data ?? []) as AppSetting[]
}

export async function saveAppSetting(key: string, value: unknown): Promise<void> {
  const { error } = await db().from('app_settings').update({ value }).eq('key', key)
  if (error) throw error
}

/**
 * Fija el último número ya usado de un consecutivo (p. ej. RSA 2026) para que el
 * sistema continúe la numeración manual. Solo ADMIN; solo puede subir el valor.
 */
export async function setCounterFloor(counterCode: string, periodYear: number, lastValue: number): Promise<number> {
  if (!counterCode.trim()) throw new Error('Indique el consecutivo.')
  if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) throw new Error('Año no válido.')
  if (!Number.isInteger(lastValue) || lastValue < 0) throw new Error('El último número usado debe ser un entero mayor o igual a 0.')
  const { data, error } = await db().rpc('set_counter_floor', {
    p_counter_code: counterCode.trim(),
    p_period_year: periodYear,
    p_last_value: lastValue,
  })
  if (error) throw error
  const next = (data as { next_value?: number } | null)?.next_value
  if (typeof next !== 'number') throw new Error('Respuesta inesperada del servidor.')
  return next
}

export async function listPendingDecisions(): Promise<PendingDecision[]> {
  const { data, error } = await db().from('pending_decisions')
    .select('id, code, topic, decision_required, suggested_owner, priority, status, decision_text, evidence')
    .order('code')
  if (error) throw error
  return (data ?? []) as PendingDecision[]
}

export async function decidePendingDecision(
  id: string,
  decision: Pick<PendingDecision, 'status' | 'decision_text' | 'evidence'>,
  decidedBy: string,
): Promise<void> {
  const { error } = await db().from('pending_decisions').update({
    ...decision,
    decided_by: decision.status === 'PENDIENTE' ? null : decidedBy,
    decided_at: decision.status === 'PENDIENTE' ? null : new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}

export interface UserNotification {
  id: string
  type: string
  entity_type: string | null
  entity_id: string | null
  message: string
  read_at: string | null
  created_at: string
}

export async function listMyNotifications(): Promise<UserNotification[]> {
  const { data, error } = await db().from('notifications')
    .select('id, type, entity_type, entity_id, message, read_at, created_at')
    .order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return (data ?? []) as UserNotification[]
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await db().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
