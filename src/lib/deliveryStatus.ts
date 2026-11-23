/**
 * Estado de un plazo de entrega frente a la fecha de hoy (Bloque B, tarea 8).
 * Usa el mismo calendario hábil que deliveryDates (WORKDAY.INTL + festivos).
 */
import { businessDaysBetween, weekendFromWorkdayIntl, type DeliverySettings } from './businessDays'

export type DeliveryState = 'OVERDUE' | 'DUE_SOON' | 'ON_TIME' | 'DELIVERED' | 'UNKNOWN'

export interface DeliveryStatus {
  state: DeliveryState
  /** Días hábiles que faltan (negativo si ya venció); null si no se puede calcular */
  businessDaysLeft: number | null
}

export const DELIVERY_STATE_LABELS: Record<DeliveryState, string> = {
  OVERDUE: 'Vencida',
  DUE_SOON: 'Próxima a vencer',
  ON_TIME: 'A tiempo',
  DELIVERED: 'Entregada',
  UNKNOWN: 'Sin calcular',
}

export const DELIVERY_STATE_TONES: Record<DeliveryState, 'danger' | 'warning' | 'success' | 'neutral' | 'info'> = {
  OVERDUE: 'danger',
  DUE_SOON: 'warning',
  ON_TIME: 'success',
  DELIVERED: 'neutral',
  UNKNOWN: 'info',
}

/** Fecha de hoy (YYYY-MM-DD) en Bogotá */
export function todayInBogota(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

/** Fecha (YYYY-MM-DD) en Bogotá de un instante ISO */
export function bogotaDateOf(isoDateTime: string): string {
  return todayInBogota(new Date(isoDateTime))
}

export function deliveryStatus(input: {
  dueDate: string | null
  today: string
  settings: DeliverySettings
  holidays: string[]
  alertBusinessDays: number
  delivered?: boolean
}): DeliveryStatus {
  if (input.delivered) return { state: 'DELIVERED', businessDaysLeft: null }
  const weekend = input.settings.weekendCode === null ? null : weekendFromWorkdayIntl(input.settings.weekendCode)
  if (!input.dueDate || !weekend) return { state: 'UNKNOWN', businessDaysLeft: null }
  const left = businessDaysBetween(input.today, input.dueDate, { weekend, holidays: input.holidays })
  if (left < 0) return { state: 'OVERDUE', businessDaysLeft: left }
  if (left <= input.alertBusinessDays) return { state: 'DUE_SOON', businessDaysLeft: left }
  return { state: 'ON_TIME', businessDaysLeft: left }
}
