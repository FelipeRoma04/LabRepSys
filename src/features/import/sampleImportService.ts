import { supabase } from '../../lib/supabase'
import { fromExcelSerial, isSuspiciousDate } from '../../lib/format/date'
import type { ColumnMapping, ImportIssue, ImportPreviewResult, ImportRowPreview } from './types'

export interface ParsedSampleRow {
  code: string
  client_nit?: string | null
  client_name?: string | null
  matrix_code?: string | null
  matrix_name?: string | null
  plan_code?: string | null
  sampling_point?: string | null
  sampled_at?: string | null
  observations?: string | null
  client_id?: string | null
  matrix_id?: string | null
}

const EXTERNAL_LAB_REGEX = /\b(subcontratad[oa]s?|laboratorio\s+externo|lab\s+externo|agq|chemilab|iha|enviad[oa]\s+a)\b/i

export interface SampleReferenceContext {
  clients: Array<{ id: string; nit: string | null; business_name: string; active?: boolean }>
  matrices: Array<{ id: string; code: string; name: string; active?: boolean }>
  codePattern?: string
  existingCodes?: Set<string>
}

/**
 * Normaliza y analiza un valor de fecha que puede venir como Date, número serial de Excel o string.
 */
export function parseExcelDate(value: unknown): { isoDate: string | null; warning?: string } {
  if (value === null || value === undefined || value === '') {
    return { isoDate: null }
  }

  let date: Date | null = null
  let wasSerial = false

  if (value instanceof Date) {
    date = value
  } else if (typeof value === 'number' && value > 1000) {
    // Posible serial de Excel (ej. 45200)
    const result = fromExcelSerial(value)
    date = result.date
    wasSerial = true
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    const timestamp = Date.parse(trimmed)
    if (!isNaN(timestamp)) {
      date = new Date(timestamp)
    }
  }

  if (!date || isNaN(date.getTime())) {
    return { isoDate: null, warning: 'Formato de fecha no reconocido o inválido.' }
  }

  let warning: string | undefined = undefined
  const suspicious = isSuspiciousDate(date)

  if (date.getTime() > Date.now()) {
    warning = 'La fecha de muestreo está en el futuro; verificar antes de importar.'
  } else if (suspicious.suspicious) {
    warning = `El año de muestreo (${date.getFullYear()}) difiere del periodo actual; verificar posible error de digitación.`
  } else if (wasSerial) {
    warning = `Fecha convertida desde número de serie de Excel (${date.toLocaleDateString('es-CO')}).`
  }

  return {
    isoDate: date.toISOString(),
    warning,
  }
}

/**
 * Valida un conjunto de filas de muestras según las reglas de negocio y el libro de recepción.
 */
export async function validateSampleRows(
  rawRows: Array<{ _rowNumber: number; [col: string]: unknown }>,
  mapping: ColumnMapping,
  fileName: string,
  fileHash: string,
  sheetName: string,
  context: SampleReferenceContext,
): Promise<ImportPreviewResult<ParsedSampleRow>> {
  const previewRows: ImportRowPreview<ParsedSampleRow>[] = []
  const allIssues: ImportIssue[] = []
  const seenCodesInFile = new Set<string>()

  const codePattern = context.codePattern || '^AG[0-9]{4}$'
  let matcher: RegExp
  try {
    matcher = new RegExp(codePattern)
  } catch {
    matcher = /^AG[0-9]{4}$/
  }

  const activeClients = context.clients.filter((c) => c.active !== false)
  const activeMatrices = context.matrices.filter((m) => m.active !== false)
  const existingCodes = context.existingCodes || new Set<string>()

  for (const row of rawRows) {
    const rowNumber = row._rowNumber
    const issues: ImportIssue[] = []

    const rawCode = String(row[mapping.code] ?? '').trim()
    const rawClientNit = mapping.client_nit ? String(row[mapping.client_nit] ?? '').trim() : ''
    const rawClientName = mapping.client_name ? String(row[mapping.client_name] ?? '').trim() : ''
    const rawMatrixCode = mapping.matrix_code ? String(row[mapping.matrix_code] ?? '').trim() : ''
    const rawMatrixName = mapping.matrix_name ? String(row[mapping.matrix_name] ?? '').trim() : ''
    const rawPlan = mapping.plan_code ? String(row[mapping.plan_code] ?? '').trim() : ''
    const rawPoint = mapping.sampling_point ? String(row[mapping.sampling_point] ?? '').trim() : ''
    const rawSampledAt = mapping.sampled_at ? row[mapping.sampled_at] : undefined
    const rawObs = mapping.observations ? String(row[mapping.observations] ?? '').trim() : ''

    // 1. Validar Código de Muestra
    if (!rawCode) {
      issues.push({ row: rowNumber, field: 'code', message: 'El código de muestra es obligatorio.', severity: 'error' })
    } else {
      matcher.lastIndex = 0
      if (!matcher.test(rawCode)) {
        issues.push({
          row: rowNumber,
          field: 'code',
          message: `Código "${rawCode}" inválido según el patrón (${codePattern}).`,
          severity: 'error',
        })
      } else if (seenCodesInFile.has(rawCode)) {
        issues.push({ row: rowNumber, field: 'code', message: `El código "${rawCode}" está repetido dentro del archivo.`, severity: 'error' })
      } else if (existingCodes.has(rawCode)) {
        issues.push({ row: rowNumber, field: 'code', message: `El código "${rawCode}" ya existe en el sistema (evitando duplicado).`, severity: 'warning' })
      } else {
        seenCodesInFile.add(rawCode)
      }
    }

    // 2. Resolver Cliente (NIT o Razón Social)
    let matchedClient: { id: string; nit: string | null; business_name: string } | undefined = undefined
    if (rawClientNit || rawClientName) {
      matchedClient = activeClients.find((c) => {
        if (rawClientNit && c.nit && c.nit.replace(/\D/g, '') === rawClientNit.replace(/\D/g, '')) {
          return true
        }
        if (rawClientName && c.business_name.toLowerCase() === rawClientName.toLowerCase()) {
          return true
        }
        return false
      })
      if (!matchedClient) {
        issues.push({
          row: rowNumber,
          field: 'client_name',
          message: `Cliente no encontrado (${rawClientNit || rawClientName}).`,
          severity: 'error',
        })
      }
    } else {
      issues.push({
        row: rowNumber,
        field: 'client_name',
        message: 'Debe mapear una columna de NIT o Razón social para identificar al cliente.',
        severity: 'error',
      })
    }

    // 3. Resolver Matriz (Código o Nombre)
    let matchedMatrix: { id: string; code: string; name: string } | undefined = undefined
    if (rawMatrixCode || rawMatrixName) {
      matchedMatrix = activeMatrices.find((m) => {
        if (rawMatrixCode && m.code.toLowerCase() === rawMatrixCode.toLowerCase()) {
          return true
        }
        if (rawMatrixName && m.name.toLowerCase() === rawMatrixName.toLowerCase()) {
          return true
        }
        return false
      })
      if (!matchedMatrix) {
        issues.push({
          row: rowNumber,
          field: 'matrix_name',
          message: `Matriz no encontrada (${rawMatrixCode || rawMatrixName}).`,
          severity: 'error',
        })
      }
    } else {
      issues.push({
        row: rowNumber,
        field: 'matrix_name',
        message: 'Debe mapear una columna de Código o Nombre de matriz.',
        severity: 'error',
      })
    }

    // 4. Validar Fecha de Muestreo (con soporte serial de Excel y detección de fechas sospechosas)
    let isoDate: string | null = null
    if (rawSampledAt !== undefined && rawSampledAt !== null && rawSampledAt !== '') {
      const parsedDateResult = parseExcelDate(rawSampledAt)
      isoDate = parsedDateResult.isoDate
      if (parsedDateResult.warning) {
        issues.push({
          row: rowNumber,
          field: 'sampled_at',
          message: parsedDateResult.warning,
          severity: parsedDateResult.isoDate ? 'warning' : 'error',
        })
      }
    }

    // 5. Regla Libro de Recepción (SA-OP-LAA-TEC-FOR.5.3):
    // No migrar observaciones de texto libre automáticamente.
    // Si contiene laboratorio externo, marcar "estructurar manualmente".
    let requiresManualStructuring = false
    if (rawObs && EXTERNAL_LAB_REGEX.test(rawObs)) {
      requiresManualStructuring = true
      issues.push({
        row: rowNumber,
        field: 'observations',
        message: 'Laboratorio externo detectado en observaciones: requiere estructurar envío manualmente tras la recepción.',
        severity: 'warning',
      })
    }

    const hasBlockingError = issues.some((i) => i.severity === 'error')
    const parsedData: ParsedSampleRow = {
      code: rawCode,
      client_nit: rawClientNit || matchedClient?.nit || null,
      client_name: rawClientName || matchedClient?.business_name || null,
      matrix_code: rawMatrixCode || matchedMatrix?.code || null,
      matrix_name: rawMatrixName || matchedMatrix?.name || null,
      plan_code: rawPlan || null,
      sampling_point: rawPoint || null,
      sampled_at: isoDate,
      observations: rawObs || null,
      client_id: matchedClient?.id ?? null,
      matrix_id: matchedMatrix?.id ?? null,
    }

    previewRows.push({
      rowNumber,
      data: parsedData,
      issues,
      isValid: !hasBlockingError,
      requiresManualStructuring,
    })
    allIssues.push(...issues)
  }

  const errorCount = previewRows.filter((r) => !r.isValid).length
  const warningCount = previewRows.filter((r) => r.isValid && r.issues.length > 0).length
  const validCount = previewRows.filter((r) => r.isValid).length

  return {
    target: 'samples',
    fileName,
    fileHash,
    sheetName,
    totalRows: previewRows.length,
    validCount,
    errorCount,
    warningCount,
    rows: previewRows,
    issues: allIssues,
  }
}

/**
 * Ejecuta la importación en lote de muestras a través del RPC `import_samples_csv`
 * garantizando idempotencia y trazabilidad en la auditoría.
 */
export async function executeSampleBatchImport(
  validRows: ParsedSampleRow[],
  onProgress?: (processed: number, total: number) => void,
): Promise<{ importedCount: number; errors: ImportIssue[] }> {
  if (!supabase) {
    throw new Error('Supabase no está disponible.')
  }

  const errors: ImportIssue[] = []
  let totalImported = 0
  const BATCH_SIZE = 50

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const chunk = validRows.slice(i, i + BATCH_SIZE)
    const payload = chunk.map((row) => ({
      code: row.code,
      client_nit: row.client_nit,
      client_name: row.client_name,
      matrix_code: row.matrix_code,
      matrix_name: row.matrix_name,
      plan_code: row.plan_code,
      sampling_point: row.sampling_point,
      sampled_at: row.sampled_at,
    }))

    const { data, error } = await supabase.rpc('import_samples_csv', { rows: payload })
    if (error) {
      errors.push({
        row: i + 1,
        message: `Error al procesar lote (${i + 1}-${i + chunk.length}): ${error.message}`,
        severity: 'error',
      })
    } else if (data) {
      const res = data as { imported_count?: number; errors?: Array<{ row: number; message: string }> }
      totalImported += res.imported_count ?? 0
      if (res.errors && res.errors.length > 0) {
        for (const err of res.errors) {
          errors.push({
            row: i + err.row,
            message: err.message,
            severity: 'error',
          })
        }
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, validRows.length), validRows.length)
    }

    // Ceder el hilo de ejecución brevemente
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return {
    importedCount: totalImported,
    errors,
  }
}
