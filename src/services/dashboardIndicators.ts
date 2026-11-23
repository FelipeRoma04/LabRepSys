/**
 * Indicadores operativos del inicio (Bloque B, tarea 9): plazos de entrega al
 * cliente y reportes de laboratorios externos retrasados.
 */
import { deliveryDates } from '../lib/businessDays'
import { bogotaDateOf, deliveryStatus, todayInBogota } from '../lib/deliveryStatus'
import { supabase } from '../lib/supabase'
import { listDeliveredSampleIds, loadDeliveryConfig } from './deliveryDates'

export interface DeadlineIndicators {
  overdue: number
  dueSoon: number
  /** Aviso cuando los plazos no se pueden calcular (p. ej. faltan días no hábiles) */
  issue: string | null
  alertBusinessDays: number
}

export interface LateExternalReport {
  shipment_id: string
  sample_code: string
  laboratory_name: string
  expected_at: string | null
  days_overdue: number
}

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

/** Cuenta muestras sin reporte emitido con la entrega al cliente vencida o próxima a vencer */
export async function loadDeadlineIndicators(now: Date = new Date()): Promise<DeadlineIndicators> {
  const [config, delivered, samples] = await Promise.all([
    loadDeliveryConfig(),
    listDeliveredSampleIds(),
    db().from('samples').select('id, received_at'),
  ])
  if (samples.error) throw samples.error
  const today = todayInBogota(now)
  let overdue = 0
  let dueSoon = 0
  let issue: string | null = null
  for (const sample of (samples.data ?? []) as Array<{ id: string; received_at: string }>) {
    if (delivered.has(sample.id)) continue
    const dates = deliveryDates(bogotaDateOf(sample.received_at), config.settings, config.holidays)
    issue ??= dates.issues[0]?.message ?? null
    const status = deliveryStatus({
      dueDate: dates.clientDueDate,
      today,
      settings: config.settings,
      holidays: config.holidays,
      alertBusinessDays: config.alertBusinessDays,
    })
    if (status.state === 'OVERDUE') overdue += 1
    if (status.state === 'DUE_SOON') dueSoon += 1
  }
  return { overdue, dueSoon, issue, alertBusinessDays: config.alertBusinessDays }
}

/** Envíos a laboratorios externos con la fecha esperada vencida, del más atrasado al menos */
export async function listLateExternalReports(): Promise<LateExternalReport[]> {
  const { data, error } = await db()
    .from('v_pending_external_reports')
    .select('shipment_id, sample_code, laboratory_name, expected_at, days_overdue')
    .gt('days_overdue', 0)
    .order('days_overdue', { ascending: false })
  if (error) throw error
  return (data ?? []) as LateExternalReport[]
}
