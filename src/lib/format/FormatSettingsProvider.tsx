/**
 * K01 - Requisito 4.1: lee date_format, datetime_format y timezone de
 * app_settings una vez por sesión y los deja vigentes para toda la UI
 * (formatDateTime y formatDate los usan por defecto).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../supabase'
import { DEFAULT_FORMAT_SETTINGS, setActiveFormatSettings } from './date'
import { FORMAT_SETTING_KEYS, parseFormatSettings } from './formatSettings'
import { FormatSettingsContext } from './formatSettingsContext'
import type { FormatSettings } from './types'

export function FormatSettingsProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const [settings, setSettings] = useState<FormatSettings>(DEFAULT_FORMAT_SETTINGS)

  useEffect(() => {
    if (status !== 'authenticated' || !supabase) return
    let active = true
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', Object.values(FORMAT_SETTING_KEYS))
      .then(({ data, error }) => {
        if (!active || error || !data) return
        const loaded = parseFormatSettings(data as Array<{ key: string; value: unknown }>)
        setActiveFormatSettings(loaded)
        setSettings(loaded)
      })
    return () => { active = false }
  }, [status])

  return <FormatSettingsContext.Provider value={settings}>{children}</FormatSettingsContext.Provider>
}
