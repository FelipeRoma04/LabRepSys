/**
 * Pruebas unitarias de la biblioteca de formato y localización.
 * K01 - Todos los requisitos (1.1–4.3)
 */
import { describe, it, expect } from 'vitest'
import { formatNumber, parseLocaleNumber } from './number'
import { formatResult } from './result'
import { formatValueState } from './valueState'
import { formatDateTime, isSuspiciousDate, fromExcelSerial } from './date'

// ─── Req 1.1 / 1.2: formatNumber ────────────────────────────────────────────
describe('formatNumber', () => {
  it('usa coma decimal (es-CO)', () => {
    expect(formatNumber(0.04, 2)).toBe('0,04')
  })

  it('conserva exactamente los decimales indicados', () => {
    expect(formatNumber(0.040, 3)).toBe('0,040')
  })

  it('no redondea: muestra los decimales exactos pasados', () => {
    // 1.23456 con 5 decimales → "1,23456"
    expect(formatNumber(1.23456, 5)).toBe('1,23456')
  })

  it('cero válido se muestra como "0"', () => {
    expect(formatNumber(0, 0)).toBe('0')
  })

  it('cero con decimales se muestra como "0,000"', () => {
    expect(formatNumber(0, 3)).toBe('0,000')
  })

  it('formatea miles con punto de miles (es-CO)', () => {
    expect(formatNumber(1234567.89, 2)).toBe('1.234.567,89')
  })
})

// ─── Req 1.3: parseLocaleNumber — misma interpretación para "0,040" y "0.040" ─
describe('parseLocaleNumber', () => {
  it('"0,040" se interpreta como 0.040', () => {
    const r = parseLocaleNumber('0,040')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toBeCloseTo(0.04)
      expect(r.decimalPlaces).toBe(3)
    }
  })

  it('"0.040" se interpreta como 0.040', () => {
    const r = parseLocaleNumber('0.040')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toBeCloseTo(0.04)
      expect(r.decimalPlaces).toBe(3)
    }
  })

  it('"0,040" y "0.040" producen el mismo valor numérico', () => {
    const a = parseLocaleNumber('0,040')
    const b = parseLocaleNumber('0.040')
    expect(a.ok && b.ok && a.ok === b.ok).toBe(true)
    if (a.ok && b.ok) {
      expect(a.value).toBe(b.value)
    }
  })

  it('número entero sin separadores', () => {
    const r = parseLocaleNumber('1234')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toBe(1234)
      expect(r.decimalPlaces).toBe(0)
    }
  })

  // Req 1.4: ambiguo → pedir confirmación
  it('"1.234,5" es ambiguo y retorna reason:ambiguous', () => {
    const r = parseLocaleNumber('1.234,5')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('ambiguous')
    }
  })

  it('"1,234.5" es ambiguo y retorna reason:ambiguous', () => {
    const r = parseLocaleNumber('1,234.5')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('ambiguous')
    }
  })

  it('texto no numérico retorna reason:invalid', () => {
    const r = parseLocaleNumber('abc')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('invalid')
    }
  })

  it('string vacío retorna reason:invalid', () => {
    const r = parseLocaleNumber('')
    expect(r.ok).toBe(false)
  })
})

// ─── Req 2.1, 2.2, 2.3: formatResult ────────────────────────────────────────
describe('formatResult', () => {
  it('muestra texto original sin modificar ("< 0,040")', () => {
    expect(formatResult({ originalText: '< 0,040' })).toBe('< 0,040')
  })

  it('texto original tiene prioridad sobre numericValue', () => {
    expect(formatResult({ originalText: '< 0,040', numericValue: 0.04, decimalPlaces: 3 })).toBe('< 0,040')
  })

  it('compone operador + número cuando no hay texto original', () => {
    expect(formatResult({ operator: '<', numericValue: 0.04, decimalPlaces: 3 })).toBe('< 0,040')
  })

  it('compone "<= 5" correctamente', () => {
    expect(formatResult({ operator: '<=', numericValue: 5, decimalPlaces: 0 })).toBe('<= 5')
  })

  it('sin operador muestra solo el número', () => {
    expect(formatResult({ numericValue: 1.5, decimalPlaces: 1 })).toBe('1,5')
  })

  // Req 2.3: sin valor → null, nunca "0"
  it('sin valor retorna null', () => {
    expect(formatResult({})).toBeNull()
  })

  it('sin valor con estado retorna null (la pantalla usa formatValueState)', () => {
    expect(formatResult({ state: 'NOT_APPLICABLE' })).toBeNull()
  })

  // Req 3.2: cero válido se muestra como "0"
  it('VALUE con 0 se muestra como "0"', () => {
    expect(formatResult({ numericValue: 0, decimalPlaces: 0 })).toBe('0')
  })
})

// ─── Req 3.1, 3.2: formatValueState ─────────────────────────────────────────
describe('formatValueState', () => {
  it('NOT_APPLICABLE → "N.A."', () => {
    expect(formatValueState('NOT_APPLICABLE')).toBe('N.A.')
  })

  it('NOT_REPORTED → "N.R."', () => {
    expect(formatValueState('NOT_REPORTED')).toBe('N.R.')
  })

  it('NOT_SPECIFIED → "N.E."', () => {
    expect(formatValueState('NOT_SPECIFIED')).toBe('N.E.')
  })

  it('PENDING → "Pendiente"', () => {
    expect(formatValueState('PENDING')).toBe('Pendiente')
  })

  it('VALUE → "" (el número lo muestra formatResult)', () => {
    expect(formatValueState('VALUE')).toBe('')
  })
})

// ─── Req 4.1: formatDateTime ─────────────────────────────────────────────────
describe('formatDateTime', () => {
  it('formatea fecha con zona America/Bogota por defecto', () => {
    // 2026-01-15T12:00:00Z → en Bogota (UTC-5) = 2026-01-15 07:00
    const result = formatDateTime('2026-01-15T12:00:00.000Z')
    expect(result).toMatch(/15\/01\/2026/)
  })

  it('muestra hora cuando includeTime=true', () => {
    const result = formatDateTime('2026-01-15T12:00:00.000Z', {}, true)
    expect(result).toContain(':')
  })

  it('no muestra hora cuando includeTime=false', () => {
    const result = formatDateTime('2026-01-15T12:00:00.000Z', {}, false)
    expect(result).not.toContain(':')
  })

  it('retorna "—" para fecha inválida', () => {
    expect(formatDateTime('not-a-date')).toBe('—')
  })
})

// ─── Req 4.2: isSuspiciousDate ───────────────────────────────────────────────
describe('isSuspiciousDate', () => {
  it('fecha futura es sospechosa', () => {
    const future = new Date()
    future.setFullYear(future.getFullYear() + 2)
    const r = isSuspiciousDate(future)
    expect(r.suspicious).toBe(true)
    expect(r.reason).toBe('future')
  })

  it('año 1899 es atípico', () => {
    const r = isSuspiciousDate(new Date('1899-01-01'))
    expect(r.suspicious).toBe(true)
    expect(r.reason).toBe('atypical_year')
  })

  it('fecha reciente no es sospechosa', () => {
    const r = isSuspiciousDate(new Date('2025-06-01'))
    expect(r.suspicious).toBe(false)
  })
})

// ─── Req 4.3: fromExcelSerial ────────────────────────────────────────────────
describe('fromExcelSerial', () => {
  it('serial 45292 corresponde a 2024-01-01', () => {
    // Excel serial 45292 = 2024-01-01
    const r = fromExcelSerial(45292)
    expect(r.converted).toBe(true)
    expect(r.date.getUTCFullYear()).toBe(2024)
    expect(r.date.getUTCMonth()).toBe(0) // enero
    expect(r.date.getUTCDate()).toBe(1)
  })

  it('marca la conversión con converted:true', () => {
    const r = fromExcelSerial(45000)
    expect(r.converted).toBe(true)
  })
})
