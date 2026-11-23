/**
 * Carga la configuración de entrega (app_settings) y los festivos activos
 * (tabla holidays) para calcular fechas de entrega con src/lib/businessDays.
 */
import { supabase } from '../lib/supabase'
import { deliveryDates, type DeliveryDates, type DeliverySettings } from '../lib/businessDays'

export const DELIVERY_SETTING_KEYS = {
  weekend: 'delivery.weekend_workday_intl',
  laboratory: 'delivery.laboratory_business_days',
  client: 'delivery.client_business_days',
} as const

export const DELIVERY_ALERT_KEY = 'delivery.alert_business_days'
/** Se usa solo si el parámetro aún no existe en app_settings (migración pendiente) */
export const DEFAULT_ALERT_BUSINESS_DAYS = 3

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

function positiveInteger(value: unknown, key: string): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  throw new Error(`El parámetro "${key}" debe ser un número entero positivo de días hábiles.`)
}

/** Interpreta los valores JSON de app_settings sin asumir los que falten */
export function parseDeliverySettings(rows: Array<{ key: string; value: unknown }>): DeliverySettings {
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  const weekend = byKey.get(DELIVERY_SETTING_KEYS.weekend)
  if (!byKey.has(DELIVERY_SETTING_KEYS.laboratory) || !byKey.has(DELIVERY_SETTING_KEYS.client)) {
    throw new Error('Faltan los parámetros de días de entrega en app_settings. Aplique la migración delivery_settings.')
  }
  return {
    weekendCode: typeof weekend === 'number' || typeof weekend === 'string' ? weekend : null,
    laboratoryBusinessDays: positiveInteger(byKey.get(DELIVERY_SETTING_KEYS.laboratory), DELIVERY_SETTING_KEYS.laboratory),
    clientBusinessDays: positiveInteger(byKey.get(DELIVERY_SETTING_KEYS.client), DELIVERY_SETTING_KEYS.client),
  }
}

export interface DeliveryConfig {
  settings: DeliverySettings
  holidays: string[]
  alertBusinessDays: number
}

export async function loadDeliveryConfig(): Promise<DeliveryConfig> {
  const [settings, holidays] = await Promise.all([
    db().from('app_settings').select('key, value').in('key', [...Object.values(DELIVERY_SETTING_KEYS), DELIVERY_ALERT_KEY]),
    db().from('holidays').select('date').eq('active', true).order('date'),
  ])
  if (settings.error) throw settings.error
  if (holidays.error) throw holidays.error
  const rows = (settings.data ?? []) as Array<{ key: string; value: unknown }>
  const alert = rows.find((row) => row.key === DELIVERY_ALERT_KEY)?.value
  return {
    settings: parseDeliverySettings(rows),
    holidays: ((holidays.data ?? []) as Array<{ date: string }>).map((row) => row.date),
    alertBusinessDays: typeof alert === 'number' && Number.isInteger(alert) && alert >= 0 ? alert : DEFAULT_ALERT_BUSINESS_DAYS,
  }
}

/** Muestras que ya tienen un reporte emitido (se consideran entregadas al cliente) */
export async function listDeliveredSampleIds(): Promise<Set<string>> {
  const { data, error } = await db()
    .from('report_samples')
    .select('sample_id, report:reports!inner(status)')
    .eq('report.status', 'ISSUED')
  if (error) throw error
  return new Set(((data ?? []) as Array<{ sample_id: string }>).map((row) => row.sample_id))
}

/** Fechas de entrega para una muestra recibida en `receivedOn` (YYYY-MM-DD, hora de Colombia) */
export async function getDeliveryDates(receivedOn: string): Promise<DeliveryDates> {
  const { settings, holidays } = await loadDeliveryConfig()
  return deliveryDates(receivedOn, settings, holidays)
}
