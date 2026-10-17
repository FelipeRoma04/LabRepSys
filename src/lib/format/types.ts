/**
 * Tipos compartidos para la biblioteca de formato y localización.
 * K01 - Biblioteca de formato y localización
 */

/** Estados posibles para un valor sin dato */
export type ValueState =
  | 'VALUE'
  | 'NOT_APPLICABLE'
  | 'NOT_REPORTED'
  | 'NOT_SPECIFIED'
  | 'PENDING'

/** Operadores de resultado numérico */
export type ResultOperator = '<' | '<=' | '>' | '>=' | '='

/** Un resultado de laboratorio con operador y valor numérico */
export interface ResultValue {
  operator?: ResultOperator
  /** Valor numérico almacenado (nunca alterado) */
  numericValue?: number
  /** Decimales a mostrar (exactos, sin redondeo) */
  decimalPlaces?: number
  /** Texto original de la fuente (prioridad sobre recomponer) */
  originalText?: string
  /** Estado cuando no hay valor numérico */
  state?: ValueState
}

/** Resultado de parseLocaleNumber */
export type ParseNumberResult =
  | { ok: true; value: number; decimalPlaces: number }
  | { ok: false; reason: 'ambiguous'; candidates: [number, number] }
  | { ok: false; reason: 'invalid' }

/** Configuración de formato de fechas */
export interface FormatSettings {
  timezone: string
  dateFormat: string
  dateTimeFormat: string
}

/** Resultado de isSuspiciousDate */
export interface SuspiciousDateResult {
  suspicious: boolean
  reason?: 'future' | 'atypical_year'
}

/** Resultado de fromExcelSerial */
export interface ExcelSerialResult {
  date: Date
  converted: true
}
