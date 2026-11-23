/**
 * Formato de fechas vigente (app_settings: date_format, datetime_format y
 * timezone). K01 - Requisito 4.1. Por defecto dd/MM/yyyy y America/Bogota.
 * Lo carga FormatSettingsProvider una vez por sesión.
 */
import { useContext } from 'react'
import { FormatSettingsContext } from '../lib/format/formatSettingsContext'
import type { FormatSettings } from '../lib/format'

export function useFormatSettings(): FormatSettings {
  return useContext(FormatSettingsContext)
}
