/**
 * Parseo de resultados de laboratorio — función pura.
 * p07 — Req "PARSEO DE RESULTADOS"
 *
 * Soporta: <, <=, >, >=, =, rango, presencia, ausencia, texto cualitativo.
 * "< 0,040" → operator "<", numeric_value 0.040, original_text "< 0,040"
 * Lo no interpretable → texto cualitativo pendiente de confirmación.
 * NUNCA adivina. NUNCA reduce "<0,040" a 0.040 ni a 0.
 */
import { parseLocaleNumber } from './format/number'

export type ResultOperator = '<' | '<=' | '>' | '>=' | '='

export type ParsedResultType =
  | 'numeric'         // valor con operador opcional
  | 'range'           // "5 - 10" o "5 a 10"
  | 'presence'        // "Presencia", "Positivo", "+"
  | 'absence'         // "Ausencia", "Negativo", "-"
  | 'qualitative'     // texto que no se pudo interpretar → pendiente confirmación

export interface ParsedResult {
  type: ParsedResultType
  /** Operador si aplica (<, <=, >, >=, =) */
  operator?: ResultOperator
  /** Valor numérico almacenado (float) */
  numericValue?: number
  /** Decimales exactos tal como estaban en el texto */
  decimalPlaces?: number
  /** Para rangos */
  rangeMin?: number
  rangeMax?: number
  /** Texto original preservado — SIEMPRE se guarda */
  originalText: string
  /** true si el resultado requiere confirmación humana antes de guardar */
  pendingConfirmation: boolean
  /** Motivo por el que requiere confirmación */
  confirmationReason?: string
}

// ─── Patrones ─────────────────────────────────────────────────────────────────

const OPERATOR_PATTERN = /^(<=|>=|<|>|=)\s*/

const PRESENCE_WORDS = /^(presencia|positivo|\+)$/i
const ABSENCE_WORDS  = /^(ausencia|negativo|-)$/i

// Rango: "5 - 10", "5 a 10", "5–10"
const RANGE_PATTERN = /^(.+?)\s*(?:-|–|a)\s*(.+)$/i

const OPERATORS: ResultOperator[] = ['<=', '>=', '<', '>', '=']

/**
 * Parsea un string de resultado de laboratorio.
 * Entrada: texto tal como aparece en el informe del laboratorio.
 * Salida: ParsedResult con original_text siempre preservado.
 */
export function parseResult(raw: string): ParsedResult {
  const trimmed = raw.trim()
  const originalText = trimmed

  if (!trimmed) {
    return {
      type: 'qualitative',
      originalText,
      pendingConfirmation: true,
      confirmationReason: 'Texto vacío.',
    }
  }

  // ── Presencia / ausencia ────────────────────────────────────────────────────
  if (PRESENCE_WORDS.test(trimmed)) {
    return { type: 'presence', originalText, pendingConfirmation: false }
  }
  if (ABSENCE_WORDS.test(trimmed)) {
    return { type: 'absence', originalText, pendingConfirmation: false }
  }

  // ── Operador + número ───────────────────────────────────────────────────────
  const opMatch = trimmed.match(OPERATOR_PATTERN)
  if (opMatch) {
    const op = opMatch[0].trim() as ResultOperator
    const rest = trimmed.slice(opMatch[0].length).trim()
    const parsed = parseLocaleNumber(rest)

    if (parsed.ok) {
      return {
        type: 'numeric',
        operator: op,
        numericValue: parsed.value,
        decimalPlaces: parsed.decimalPlaces,
        originalText,
        pendingConfirmation: false,
      }
    }
    if (!parsed.ok && parsed.reason === 'ambiguous') {
      return {
        type: 'qualitative',
        originalText,
        pendingConfirmation: true,
        confirmationReason: `Número ambiguo: podría ser ${parsed.candidates[0]} o ${parsed.candidates[1]}.`,
      }
    }
    // Operador encontrado pero número inválido → cualitativo
    return {
      type: 'qualitative',
      originalText,
      pendingConfirmation: true,
      confirmationReason: 'Operador encontrado pero el valor no es numérico.',
    }
  }

  // ── Rango ───────────────────────────────────────────────────────────────────
  const rangeMatch = trimmed.match(RANGE_PATTERN)
  if (rangeMatch) {
    const minParsed = parseLocaleNumber(rangeMatch[1].trim())
    const maxParsed = parseLocaleNumber(rangeMatch[2].trim())

    if (minParsed.ok && maxParsed.ok) {
      return {
        type: 'range',
        rangeMin: minParsed.value,
        rangeMax: maxParsed.value,
        originalText,
        pendingConfirmation: false,
      }
    }
    // Si los extremos son ambiguos → confirmar
    return {
      type: 'qualitative',
      originalText,
      pendingConfirmation: true,
      confirmationReason: 'Rango detectado pero valores ambiguos.',
    }
  }

  // ── Solo número ─────────────────────────────────────────────────────────────
  const parsed = parseLocaleNumber(trimmed)
  if (parsed.ok) {
    return {
      type: 'numeric',
      numericValue: parsed.value,
      decimalPlaces: parsed.decimalPlaces,
      originalText,
      pendingConfirmation: false,
    }
  }
  if (!parsed.ok && parsed.reason === 'ambiguous') {
    return {
      type: 'qualitative',
      originalText,
      pendingConfirmation: true,
      confirmationReason: `Número ambiguo: podría ser ${parsed.candidates[0]} o ${parsed.candidates[1]}.`,
    }
  }

  // ── Texto cualitativo — requiere confirmación humana ────────────────────────
  return {
    type: 'qualitative',
    originalText,
    pendingConfirmation: true,
    confirmationReason: 'No se pudo interpretar automáticamente. Requiere confirmación.',
  }
}

// Exportar lista de operadores para uso externo
export { OPERATORS }
