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

/** Configuración vigente (app_settings). La fija FormatSettingsProvider al iniciar sesión. */
let activeSettings: FormatSettings = DEFAULT_FORMAT_SETTINGS

export function setActiveFormatSettings(settings: FormatSettings): void {
  activeSettings = settings
}

export function getActiveFormatSettings(): FormatSettings {
  return activeSettings
}

/** Aplica un patrón con dd, MM, yyyy, HH y mm (p. ej. "dd/MM/yyyy HH:mm") */
function applyPattern(pattern: string, parts: Record<string, string>): string {
  return pattern.replace(/yyyy|dd|MM|HH|mm/g, (token) => ({
    yyyy: parts.year,
    dd: parts.day,
    MM: parts.month,
    HH: parts.hour,
    mm: parts.minute,
  })[token] ?? token)
}

/**
 * Formatea un Date o string ISO a texto localizado.
 * Req 4.1: respeta la zona horaria y el formato de app_settings
 * (por defecto dd/MM/yyyy y America/Bogota).
 *
 * @param value    - Date, string ISO o timestamp numérico
 * @param settings - Ajustes puntuales sobre la configuración vigente
 * @param includeTime - true para incluir hora, false para solo fecha
 */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  settings: Partial<FormatSettings> = {},
  includeTime = true,
): string {
  if (value === null || value === undefined || value === '') return '—'
  const cfg = { ...activeSettings, ...settings }
  const date = value instanceof Date ? value : new Date(value)

  if (isNaN(date.getTime())) return '—'

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('es-CO', {
      timeZone: cfg.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  )
  return applyPattern(includeTime ? cfg.dateTimeFormat : cfg.dateFormat, parts)
}

/** Solo fecha, con el formato y la zona horaria vigentes */
export function formatDate(value: Date | string | number | null | undefined): string {
  return formatDateTime(value, {}, false)
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
