/**
 * Biblioteca de formato y localización — K01
 *
 * Punto de entrada único. Todos los módulos deben importar desde aquí:
 *   import { formatNumber, formatResult, formatValueState, formatDateTime } from 'src/lib/format'
 */
export { formatNumber, parseLocaleNumber } from './number'
export { formatResult } from './result'
export { formatValueState } from './valueState'
export { formatDateTime, isSuspiciousDate, fromExcelSerial, DEFAULT_FORMAT_SETTINGS } from './date'
export type {
  ValueState,
  ResultOperator,
  ResultValue,
  ParseNumberResult,
  FormatSettings,
  SuspiciousDateResult,
  ExcelSerialResult,
} from './types'
