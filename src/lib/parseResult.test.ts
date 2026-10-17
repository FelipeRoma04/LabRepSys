/**
 * Pruebas unitarias del parseo de resultados de laboratorio.
 * p07 — todos los casos requeridos
 */
import { describe, it, expect } from 'vitest'
import { parseResult } from './parseResult'

describe('parseResult', () => {

  // ── Operadores ──────────────────────────────────────────────────────────────
  it('"< 0,040" → operator < y numericValue 0.040 con originalText intacto', () => {
    const r = parseResult('< 0,040')
    expect(r.type).toBe('numeric')
    expect(r.operator).toBe('<')
    expect(r.numericValue).toBeCloseTo(0.04)
    expect(r.decimalPlaces).toBe(3)
    expect(r.originalText).toBe('< 0,040')
    expect(r.pendingConfirmation).toBe(false)
  })

  it('"<0,040" sin espacio → mismo resultado', () => {
    const r = parseResult('<0,040')
    expect(r.type).toBe('numeric')
    expect(r.operator).toBe('<')
    expect(r.numericValue).toBeCloseTo(0.04)
    expect(r.originalText).toBe('<0,040')
  })

  it('"<= 5" → operator <= y numericValue 5', () => {
    const r = parseResult('<= 5')
    expect(r.type).toBe('numeric')
    expect(r.operator).toBe('<=')
    expect(r.numericValue).toBe(5)
    expect(r.pendingConfirmation).toBe(false)
  })

  it('">= 100" → operator >= y numericValue 100', () => {
    const r = parseResult('>= 100')
    expect(r.type).toBe('numeric')
    expect(r.operator).toBe('>=')
    expect(r.numericValue).toBe(100)
  })

  it('"< 0.040" con punto decimal → mismo valor que "< 0,040"', () => {
    const a = parseResult('< 0,040')
    const b = parseResult('< 0.040')
    expect(a.numericValue).toBeCloseTo(b.numericValue!)
  })

  // ── Número simple ────────────────────────────────────────────────────────────
  it('"3,5" → numeric sin operador', () => {
    const r = parseResult('3,5')
    expect(r.type).toBe('numeric')
    expect(r.operator).toBeUndefined()
    expect(r.numericValue).toBeCloseTo(3.5)
    expect(r.decimalPlaces).toBe(1)
  })

  it('"0" → numeric con value 0 (cero válido, no ausencia)', () => {
    const r = parseResult('0')
    expect(r.type).toBe('numeric')
    expect(r.numericValue).toBe(0)
    expect(r.pendingConfirmation).toBe(false)
  })

  // ── Rango ────────────────────────────────────────────────────────────────────
  it('"5 - 10" → tipo range con min y max', () => {
    const r = parseResult('5 - 10')
    expect(r.type).toBe('range')
    expect(r.rangeMin).toBe(5)
    expect(r.rangeMax).toBe(10)
    expect(r.originalText).toBe('5 - 10')
  })

  it('"5 a 10" → tipo range', () => {
    const r = parseResult('5 a 10')
    expect(r.type).toBe('range')
    expect(r.rangeMin).toBe(5)
    expect(r.rangeMax).toBe(10)
  })

  // ── Presencia / ausencia ─────────────────────────────────────────────────────
  it('"Presencia" → tipo presence', () => {
    const r = parseResult('Presencia')
    expect(r.type).toBe('presence')
    expect(r.pendingConfirmation).toBe(false)
  })

  it('"POSITIVO" → tipo presence (case-insensitive)', () => {
    const r = parseResult('POSITIVO')
    expect(r.type).toBe('presence')
  })

  it('"Ausencia" → tipo absence', () => {
    const r = parseResult('Ausencia')
    expect(r.type).toBe('absence')
  })

  it('"-" → tipo absence', () => {
    const r = parseResult('-')
    expect(r.type).toBe('absence')
  })

  // ── Texto cualitativo ────────────────────────────────────────────────────────
  it('"No aplica" → qualitative con pendingConfirmation', () => {
    const r = parseResult('No aplica')
    expect(r.type).toBe('qualitative')
    expect(r.pendingConfirmation).toBe(true)
    expect(r.originalText).toBe('No aplica')
  })

  it('"Ver observaciones" → qualitative', () => {
    const r = parseResult('Ver observaciones')
    expect(r.type).toBe('qualitative')
    expect(r.pendingConfirmation).toBe(true)
  })

  // ── Ambigüedad ───────────────────────────────────────────────────────────────
  it('"1.234,5" → qualitative por ambigüedad', () => {
    const r = parseResult('1.234,5')
    expect(r.type).toBe('qualitative')
    expect(r.pendingConfirmation).toBe(true)
    expect(r.confirmationReason).toMatch(/ambiguo/i)
  })

  it('"< 1.234,5" → qualitative por número ambiguo con operador', () => {
    const r = parseResult('< 1.234,5')
    expect(r.type).toBe('qualitative')
    expect(r.pendingConfirmation).toBe(true)
  })

  // ── originalText siempre preservado ─────────────────────────────────────────
  it('nunca modifica el originalText', () => {
    const cases = ['< 0,040', '<=5', '3,5', 'Presencia', 'texto libre', '1.234,5']
    for (const raw of cases) {
      expect(parseResult(raw).originalText).toBe(raw)
    }
  })

  // ── Vacío ────────────────────────────────────────────────────────────────────
  it('string vacío → qualitative pendiente', () => {
    const r = parseResult('')
    expect(r.type).toBe('qualitative')
    expect(r.pendingConfirmation).toBe(true)
  })
})
