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

export async function loadDeliveryConfig(): Promise<{ settings: DeliverySettings; holidays: string[] }> {
  const [settings, holidays] = await Promise.all([
    db().from('app_settings').select('key, value').in('key', Object.values(DELIVERY_SETTING_KEYS)),
    db().from('holidays').select('date').eq('active', true).order('date'),
  ])
  if (settings.error) throw settings.error
  if (holidays.error) throw holidays.error
  return {
    settings: parseDeliverySettings((settings.data ?? []) as Array<{ key: string; value: unknown }>),
    holidays: ((holidays.data ?? []) as Array<{ date: string }>).map((row) => row.date),
  }
}

/** Fechas de entrega para una muestra recibida en `receivedOn` (YYYY-MM-DD, hora de Colombia) */
export async function getDeliveryDates(receivedOn: string): Promise<DeliveryDates> {
  const { settings, holidays } = await loadDeliveryConfig()
  return deliveryDates(receivedOn, settings, holidays)
}
