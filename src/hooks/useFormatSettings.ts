/**
 * Hook para leer date_format y timezone desde app_settings de Supabase.
 * K01 - Requisito 4.1
 *
 * Usa valores por defecto (America/Bogota) si no existen en la BD.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_FORMAT_SETTINGS } from '../lib/format'
import type { FormatSettings } from '../lib/format'

export function useFormatSettings(): FormatSettings {
  const [settings, setSettings] = useState<FormatSettings>(DEFAULT_FORMAT_SETTINGS)

  useEffect(() => {
    if (!supabase) return

    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['date_format', 'datetime_format', 'timezone'])
      .then(({ data }) => {
        if (!data || data.length === 0) return

        const map = Object.fromEntries(
          data.map((row: { key: string; value: string }) => [row.key, row.value]),
        )

        setSettings({
          timezone: map['timezone'] ?? DEFAULT_FORMAT_SETTINGS.timezone,
          dateFormat: map['date_format'] ?? DEFAULT_FORMAT_SETTINGS.dateFormat,
          dateTimeFormat: map['datetime_format'] ?? DEFAULT_FORMAT_SETTINGS.dateTimeFormat,
        })
      })
  }, [])

  return settings
}
