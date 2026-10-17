/**
 * Formateo y parseo de números con coma decimal (es-CO).
 * K01 - Requisitos 1.1, 1.2, 1.3, 1.4
 *
 * NUNCA redondea. Usa exactamente los decimales recibidos.
 */
import type { ParseNumberResult } from './types'

const LOCALE = 'es-CO'

/**
 * Formatea un número con coma decimal y exactamente los decimales indicados.
 * No redondea: si decimalPlaces no coincide con los decimales reales del valor,
 * el llamador es responsable de pasarlos correctamente.
 *
 * @param value - Valor numérico almacenado
 * @param decimalPlaces - Cantidad exacta de decimales a mostrar
 */
export function formatNumber(value: number, decimalPlaces: number): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
    useGrouping: true,
  }).format(value)
}

/**
 * Cuenta los decimales de un string numérico (con punto como separador decimal).
 * Usado internamente para determinar decimalPlaces.
 */
function countDecimalPlaces(str: string): number {
  const dotIndex = str.indexOf('.')
  return dotIndex === -1 ? 0 : str.length - dotIndex - 1
}

/**
 * Parsea un string ingresado por el usuario a número.
 *
 * Casos soportados:
 * - "0.040" o "0,040"  → ambos se interpretan como 0.040 (separador decimal)
 * - "1.234,5"          → ambiguo: podría ser 1234.5 o 1.2345
 * - "1,234.5"          → ambiguo: podría ser 1234.5 o 1.2345
 * - "1234"             → 1234 sin decimales
 *
 * Retorna {ok:false, reason:'ambiguous'} si el string es ambiguo.
 * Retorna {ok:false, reason:'invalid'} si no es parseable.
 */
export function parseLocaleNumber(input: string): ParseNumberResult {
  const trimmed = input.trim()

  if (!trimmed) return { ok: false, reason: 'invalid' }

  const hasDot = trimmed.includes('.')
  const hasComma = trimmed.includes(',')

  // Sin separadores de miles ni decimales ambiguos
  if (!hasDot && !hasComma) {
    const n = Number(trimmed)
    if (isNaN(n)) return { ok: false, reason: 'invalid' }
    return { ok: true, value: n, decimalPlaces: 0 }
  }

  // Solo coma: tratar como decimal (es-CO) → "0,040" = 0.040
  if (hasComma && !hasDot) {
    const normalized = trimmed.replace(',', '.')
    // Si hay más de una coma era miles sin decimal → no puede ser, ya validamos arriba
    const n = Number(normalized)
    if (isNaN(n)) return { ok: false, reason: 'invalid' }
    const dec = countDecimalPlaces(normalized)
    return { ok: true, value: n, decimalPlaces: dec }
  }

  // Solo punto: tratar como decimal anglosajón → "0.040" = 0.040
  if (hasDot && !hasComma) {
    const n = Number(trimmed)
    if (isNaN(n)) return { ok: false, reason: 'invalid' }
    const dec = countDecimalPlaces(trimmed)
    return { ok: true, value: n, decimalPlaces: dec }
  }

  // Ambos presentes: es ambiguo → "1.234,5" o "1,234.5"
  // Intentamos las dos interpretaciones y avisamos
  const dotFirst = trimmed.replace(',', '') // "1.234,5" → "1.234" si dot es miles... no
  // Interpretación A: punto = miles, coma = decimal  → "1.234,5" = 1234.5
  const interpA = Number(trimmed.replace(/\./g, '').replace(',', '.'))
  // Interpretación B: coma = miles, punto = decimal  → "1,234.5" = 1234.5
  const interpB = Number(trimmed.replace(/,/g, ''))

  void dotFirst // silenciar warning

  const validA = !isNaN(interpA)
  const validB = !isNaN(interpB)

  if (validA && validB && interpA !== interpB) {
    return {
      ok: false,
      reason: 'ambiguous',
      candidates: [interpA, interpB],
    }
  }
  if (validA) {
    return { ok: true, value: interpA, decimalPlaces: countDecimalPlaces(trimmed.replace(/\./g, '').replace(',', '.')) }
  }
  if (validB) {
    return { ok: true, value: interpB, decimalPlaces: countDecimalPlaces(trimmed.replace(/,/g, '')) }
  }

  return { ok: false, reason: 'invalid' }
}
