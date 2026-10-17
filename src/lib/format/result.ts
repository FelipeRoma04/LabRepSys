/**
 * Formateo de resultados de laboratorio.
 * K01 - Requisitos 2.1, 2.2, 2.3
 *
 * Regla crítica: "< 0,040" NUNCA se reduce a 0,040 ni a 0.
 * Si hay texto original, se muestra tal cual.
 */
import { formatNumber } from './number'
import type { ResultValue } from './types'

/**
 * Formatea un resultado de laboratorio para mostrar en pantalla.
 *
 * Prioridad:
 * 1. Si hay originalText → mostrar sin modificar
 * 2. Si hay operator + numericValue → componer "< 0,040"
 * 3. Si hay solo numericValue → mostrar número formateado
 * 4. Si no hay valor → retorna null (la pantalla NO debe mostrar 0)
 */
export function formatResult(result: ResultValue): string | null {
  // Req 2.1: texto original tiene máxima prioridad
  if (result.originalText !== undefined && result.originalText !== '') {
    return result.originalText
  }

  // Req 2.3: sin valor → null, nunca "0"
  if (result.numericValue === undefined || result.numericValue === null) {
    return null
  }

  const decimals = result.decimalPlaces ?? 0
  const formatted = formatNumber(result.numericValue, decimals)

  // Req 2.2: componer operador + número
  if (result.operator && result.operator !== '=') {
    return `${result.operator} ${formatted}`
  }

  return formatted
}
