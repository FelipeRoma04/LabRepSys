/**
 * Formateo de estados sin dato.
 * K01 - Requisitos 3.1, 3.2
 */
import type { ValueState } from './types'

const VALUE_STATE_LABELS: Record<ValueState, string> = {
  VALUE: '',            // VALUE con número → usar formatResult/formatNumber
  NOT_APPLICABLE: 'N.A.',
  NOT_REPORTED: 'N.R.',
  NOT_SPECIFIED: 'N.E.',
  PENDING: 'Pendiente',
}

/**
 * Devuelve la etiqueta en español para un estado sin dato.
 *
 * - NOT_APPLICABLE → "N.A."
 * - NOT_REPORTED   → "N.R."
 * - NOT_SPECIFIED  → "N.E."
 * - PENDING        → "Pendiente"
 * - VALUE          → "" (usar formatResult para mostrar el número)
 *
 * Req 3.2: VALUE con número 0 debe mostrarse como "0", no como estado.
 */
export function formatValueState(state: ValueState): string {
  return VALUE_STATE_LABELS[state]
}
