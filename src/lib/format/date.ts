/**
 * Formateo de fechas con zona horaria y detección de valores sospechosos.
 * K01 - Requisitos 4.1, 4.2, 4.3
 *
 * Por defecto: America/Bogota (DP pendiente de confirmación legal).
 */
import type { FormatSettings, SuspiciousDateResult, ExcelSerialResult } from './types'

export const DEFAULT_FORMAT_SETTINGS: FormatSettings = {
  timezone: 'America/Bogota',
  dateFormat: 'dd/MM/yyyy',
  dateTimeFormat: 'dd/MM/yyyy HH:mm',
}

/**
 * Año mínimo considerado típico para este sistema.
 * Muestras anteriores a 2000 o posteriores a año actual + 1 se marcan sospechosas.
 */
const MIN_TYPICAL_YEAR = 2000

/**
 * Formatea un Date o string ISO a texto localizado.
 * Req 4.1: respeta timezone y formato de app_settings.
 *
 * @param value    - Date, string ISO o timestamp numérico
 * @param settings - Configuración de formato (con defaults si no se pasa)
 * @param includeTime - true para incluir hora, false para solo fecha
 */
export function formatDateTime(
  value: Date | string | number,
  settings: Partial<FormatSettings> = {},
  includeTime = true,
): string {
  const cfg = { ...DEFAULT_FORMAT_SETTINGS, ...settings }
  const date = value instanceof Date ? value : new Date(value)

  if (isNaN(date.getTime())) return '—'

  // Construir opciones para Intl.DateTimeFormat
  const options: Intl.DateTimeFormatOptions = {
    timeZone: cfg.timezone,
  }

  if (includeTime) {
    options.year = 'numeric'
    options.month = '2-digit'
    options.day = '2-digit'
    options.hour = '2-digit'
    options.minute = '2-digit'
    options.hour12 = false
  } else {
    options.year = 'numeric'
    options.month = '2-digit'
    options.day = '2-digit'
  }

  // Formatear con es-CO en la zona indicada
  const parts = new Intl.DateTimeFormat('es-CO', options).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''

  if (includeTime) {
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`
  }
  return `${get('day')}/${get('month')}/${get('year')}`
}

/**
 * Determina si una fecha es sospechosa (futura o año atípico).
 * Req 4.2: marca pero NO corrige.
 */
export function isSuspiciousDate(value: Date | string | number): SuspiciousDateResult {
  const date = value instanceof Date ? value : new Date(value)

  if (isNaN(date.getTime())) {
    return { suspicious: true, reason: 'atypical_year' }
  }

  const now = new Date()
  if (date > now) {
    return { suspicious: true, reason: 'future' }
  }

  const year = date.getFullYear()
  const currentYear = now.getFullYear()
  if (year < MIN_TYPICAL_YEAR || year > currentYear + 1) {
    return { suspicious: true, reason: 'atypical_year' }
  }

  return { suspicious: false }
}

/**
 * Convierte un serial de fecha de Excel a Date.
 * Req 4.3: Excel cuenta días desde 1900-01-01 (con bug del año bisiesto 1900).
 * Marca la conversión para que la UI lo advierta.
 */
export function fromExcelSerial(serial: number): ExcelSerialResult {
  // Excel serial 1 = 1900-01-01, con bug: considera 1900 bisiesto
  // Ajuste estándar: restar 25569 para obtener Unix epoch en días
  const EXCEL_EPOCH_OFFSET = 25569
  const MS_PER_DAY = 86400000

  const unixMs = (serial - EXCEL_EPOCH_OFFSET) * MS_PER_DAY
  return {
    date: new Date(unixMs),
    converted: true,
  }
}
