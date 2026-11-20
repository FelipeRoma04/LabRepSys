import type ExcelJS from 'exceljs'
import type { ExcelSheetSummary } from './types'

const configuredMaxRows = Number(import.meta.env.VITE_EXCEL_IMPORT_MAX_ROWS)
const configuredMaxBytes = Number(import.meta.env.VITE_EXCEL_IMPORT_MAX_BYTES)
export const MAX_IMPORT_ROWS = Number.isSafeInteger(configuredMaxRows) && configuredMaxRows > 0
  ? configuredMaxRows
  : 5000
export const MAX_FILE_SIZE_BYTES = Number.isSafeInteger(configuredMaxBytes) && configuredMaxBytes > 0
  ? configuredMaxBytes
  : 15 * 1024 * 1024

/**
 * Calcula el hash SHA-256 de un buffer binario en formato hexadecimal.
 */
export async function computeFileHash(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const array = Array.from(new Uint8Array(digest))
  return array.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Carga un archivo Excel ignorando macros y sin ejecutar conexiones externas.
 */
export async function loadWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const { default: ExcelJSRuntime } = await import('exceljs')
  const workbook = new ExcelJSRuntime.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

/**
 * Extrae el listado de hojas disponibles con su conteo de filas y columnas.
 */
export function getWorkbookSheets(workbook: ExcelJS.Workbook): ExcelSheetSummary[] {
  const sheets: ExcelSheetSummary[] = []
  workbook.eachSheet((worksheet) => {
    sheets.push({
      name: worksheet.name,
      rowCount: worksheet.rowCount,
      columnCount: worksheet.columnCount,
    })
  })
  return sheets
}

/**
 * Extrae el valor crudo y seguro de una celda:
 * - Fórmulas: se lee únicamente el valor precalculado (cell.result); nunca se evalúan.
 * - Enlaces: se extrae solo el texto visible, sin seguir enlaces ni macros.
 * - Fechas: objeto Date o número de serie.
 */
export function extractCellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value
  if (value === null || value === undefined) return ''

  // Fórmulas
  if (typeof value === 'object' && 'formula' in value) {
    const result = (value as { result?: unknown }).result
    return result !== undefined && result !== null ? result : ''
  }

  // Hipervínculos
  if (typeof value === 'object' && 'text' in value) {
    return String((value as { text: unknown }).text ?? '').trim()
  }

  // Celdas de texto enriquecido (RichText)
  if (typeof value === 'object' && 'richText' in value && Array.isArray((value as { richText: unknown[] }).richText)) {
    return (value as { richText: Array<{ text?: string }> }).richText.map((part) => part.text ?? '').join('').trim()
  }

  // Fechas nativas de ExcelJS
  if (value instanceof Date) {
    return value
  }

  // String o número
  if (typeof value === 'string') {
    return value.trim()
  }

  return value
}

export interface SheetRawData {
  headers: string[]
  rows: Array<{ _rowNumber: number; [col: string]: unknown }>
  totalRows: number
  headerRowNumber: number
}

/**
 * Lee los datos de una hoja seleccionada respetando el límite máximo de filas.
 */
export function readSheetRawRows(
  worksheet: ExcelJS.Worksheet,
  maxRows: number = MAX_IMPORT_ROWS,
): SheetRawData {
  let headerRowNumber = -1
  const headers: string[] = []
  const colIndexToHeader = new Map<number, string>()

  // 1. Detectar la fila de encabezados (primera fila con datos significativos)
  worksheet.eachRow((row, rowNumber) => {
    if (headerRowNumber !== -1) return
    const values: string[] = []
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = String(extractCellValue(cell) ?? '').trim()
      if (text) {
        values.push(text)
        colIndexToHeader.set(colNumber, text)
      }
    })
    if (values.length > 0) {
      headerRowNumber = rowNumber
      // Resolver encabezados duplicados si existieran
      const seen = new Map<string, number>()
      for (const [colNumber, text] of colIndexToHeader.entries()) {
        const count = seen.get(text) ?? 0
        seen.set(text, count + 1)
        const finalHeader = count === 0 ? text : `${text} (${count + 1})`
        colIndexToHeader.set(colNumber, finalHeader)
        headers.push(finalHeader)
      }
    }
  })

  if (headerRowNumber === -1 || headers.length === 0) {
    return { headers: [], rows: [], totalRows: 0, headerRowNumber: -1 }
  }

  // 2. Extraer las filas de datos
  const rows: Array<{ _rowNumber: number; [col: string]: unknown }> = []
  let totalDataRows = 0

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return
    totalDataRows += 1

    if (rows.length >= maxRows) return

    const rowObj: { _rowNumber: number; [col: string]: unknown } = { _rowNumber: rowNumber }
    let hasAnyValue = false

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = colIndexToHeader.get(colNumber)
      if (header) {
        const val = extractCellValue(cell)
        if (val !== '' && val !== null && val !== undefined) {
          hasAnyValue = true
        }
        rowObj[header] = val
      }
    })

    if (hasAnyValue) {
      rows.push(rowObj)
    }
  })

  return {
    headers,
    rows,
    totalRows: totalDataRows,
    headerRowNumber,
  }
}
