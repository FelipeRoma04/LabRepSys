import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_FORMAT_SETTINGS, formatDate, formatDateTime, setActiveFormatSettings } from './date'
import { parseFormatSettings } from './formatSettings'

afterEach(() => setActiveFormatSettings(DEFAULT_FORMAT_SETTINGS))

describe('formato de fechas vigente (K01 4.1)', () => {
  it('usa dd/mm/aaaa y la hora de Bogotá por defecto, sin depender del navegador', () => {
    // 03:30 UTC del 5 de diciembre = 22:30 del 4 de diciembre en Bogotá
    expect(formatDateTime('2026-12-05T03:30:00Z')).toBe('04/12/2026 22:30')
    expect(formatDate('2026-12-05T03:30:00Z')).toBe('04/12/2026')
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('no es fecha')).toBe('—')
  })

  it('respeta el patrón y la zona horaria configurados', () => {
    setActiveFormatSettings({ timezone: 'UTC', dateFormat: 'yyyy-MM-dd', dateTimeFormat: 'dd-MM-yyyy HH:mm' })
    expect(formatDate('2026-12-05T03:30:00Z')).toBe('2026-12-05')
    expect(formatDateTime('2026-12-05T03:30:00Z')).toBe('05-12-2026 03:30')
  })

  it('usa formato de 24 horas también a medianoche', () => {
    expect(formatDateTime('2026-12-05T05:00:00Z')).toBe('05/12/2026 00:00')
  })
})

describe('parseFormatSettings', () => {
  it('lee los valores de app_settings y completa los que falten', () => {
    expect(parseFormatSettings([
      { key: 'date_format', value: 'yyyy-MM-dd' },
      { key: 'timezone', value: 'America/Lima' },
    ])).toEqual({ timezone: 'America/Lima', dateFormat: 'yyyy-MM-dd', dateTimeFormat: 'dd/MM/yyyy HH:mm' })
  })

  it('descarta una zona horaria inválida o valores que no son texto', () => {
    expect(parseFormatSettings([
      { key: 'timezone', value: 'Marte/Olympus' },
      { key: 'datetime_format', value: 42 },
    ])).toEqual(DEFAULT_FORMAT_SETTINGS)
  })
})
