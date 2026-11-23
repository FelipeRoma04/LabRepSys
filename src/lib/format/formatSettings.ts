/** Lectura de la configuración de formato desde app_settings (K01 4.1) */
import { DEFAULT_FORMAT_SETTINGS } from './date'
import type { FormatSettings } from './types'

export const FORMAT_SETTING_KEYS = { date: 'date_format', dateTime: 'datetime_format', timezone: 'timezone' } as const

/** Interpreta las filas de app_settings; ignora valores vacíos o con otro tipo */
export function parseFormatSettings(rows: Array<{ key: string; value: unknown }>): FormatSettings {
  const text = (key: string) => {
    const value = rows.find((row) => row.key === key)?.value
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  const timezone = text(FORMAT_SETTING_KEYS.timezone)
  let validTimezone = DEFAULT_FORMAT_SETTINGS.timezone
  if (timezone) {
    try {
      new Intl.DateTimeFormat('es-CO', { timeZone: timezone })
      validTimezone = timezone
    } catch {
      validTimezone = DEFAULT_FORMAT_SETTINGS.timezone
    }
  }
  return {
    timezone: validTimezone,
    dateFormat: text(FORMAT_SETTING_KEYS.date) ?? DEFAULT_FORMAT_SETTINGS.dateFormat,
    dateTimeFormat: text(FORMAT_SETTING_KEYS.dateTime) ?? DEFAULT_FORMAT_SETTINGS.dateTimeFormat,
  }
}
