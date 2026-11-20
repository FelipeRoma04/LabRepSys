import { supabase } from '../../lib/supabase'
import { isSuspiciousDate } from '../../lib/format/date'
import type { ColumnMapping, ImportIssue, ImportPreviewResult, ImportRowPreview } from './types'

export interface ParsedTestRow {
  code: string
  parameter_name: string
  default_unit?: string | null
  lcm?: number | null
  uncertainty_text?: string | null
  accreditation_type?: 'ACCREDITED' | 'NOT_ACCREDITED' | 'NOT_APPLICABLE' | null
  technique?: string | null
  observations?: string | null
  valid_from?: string | null
}

const VALID_ACCREDITATION_TYPES = new Set(['ACCREDITED', 'NOT_ACCREDITED', 'NOT_APPLICABLE'])

/**
 * Valida un conjunto de filas crudas de Excel contra las reglas de negocio de Ensayos.
 */
export async function validateTestRows(
  rawRows: Array<{ _rowNumber: number; [col: string]: unknown }>,
  mapping: ColumnMapping,
  fileName: string,
  fileHash: string,
  sheetName: string,
  existingCodes: Set<string> = new Set(),
): Promise<ImportPreviewResult<ParsedTestRow>> {
  const previewRows: ImportRowPreview<ParsedTestRow>[] = []
  const allIssues: ImportIssue[] = []
  const seenCodesInFile = new Set<string>()

  for (const row of rawRows) {
    const rowNumber = row._rowNumber
    const issues: ImportIssue[] = []

    // 1. Extraer valores según mapeo
    const rawCode = String(row[mapping.code] ?? '').trim()
    const rawParam = String(row[mapping.parameter_name] ?? '').trim()
    const rawUnit = mapping.default_unit ? String(row[mapping.default_unit] ?? '').trim() : ''
    const rawLcm = mapping.lcm ? row[mapping.lcm] : undefined
    const rawUncertainty = mapping.uncertainty_text ? String(row[mapping.uncertainty_text] ?? '').trim() : ''
    const rawAccreditation = mapping.accreditation_type ? String(row[mapping.accreditation_type] ?? '').trim().toUpperCase() : ''
    const rawTechnique = mapping.technique ? String(row[mapping.technique] ?? '').trim() : ''
    const rawObs = mapping.observations ? String(row[mapping.observations] ?? '').trim() : ''
    const rawValidFrom = mapping.valid_from ? row[mapping.valid_from] : undefined

    // 2. Validar Código
    if (!rawCode) {
      issues.push({ row: rowNumber, field: 'code', message: 'El código de ensayo es obligatorio.', severity: 'error' })
    } else if (!/^SA/.test(rawCode)) {
      issues.push({ row: rowNumber, field: 'code', message: 'El código vigente debe tener prefijo SA (ej. SA001).', severity: 'error' })
    } else if (seenCodesInFile.has(rawCode)) {
      issues.push({ row: rowNumber, field: 'code', message: `El código "${rawCode}" está duplicado dentro del archivo.`, severity: 'error' })
    } else if (existingCodes.has(rawCode)) {
      issues.push({ row: rowNumber, field: 'code', message: `El código "${rawCode}" ya existe en el sistema (evitando duplicado).`, severity: 'warning' })
    } else {
      seenCodesInFile.add(rawCode)
    }

    // 3. Validar Parámetro
    if (!rawParam) {
      issues.push({ row: rowNumber, field: 'parameter_name', message: 'El nombre del parámetro es obligatorio.', severity: 'error' })
    }

    // 4. Validar LCM
    let parsedLcm: number | null = null
    if (rawLcm !== undefined && rawLcm !== null && rawLcm !== '') {
      const numStr = String(rawLcm).replace(',', '.').trim()
      const n = Number(numStr)
      if (isNaN(n) || !isFinite(n)) {
        issues.push({ row: rowNumber, field: 'lcm', message: 'El valor de LCM debe ser numérico.', severity: 'error' })
      } else {
        parsedLcm = n
      }
    }

    // 5. Validar Acreditación
    let parsedAccreditation: 'ACCREDITED' | 'NOT_ACCREDITED' | 'NOT_APPLICABLE' | null = null
    if (rawAccreditation) {
      if (VALID_ACCREDITATION_TYPES.has(rawAccreditation)) {
        parsedAccreditation = rawAccreditation as 'ACCREDITED' | 'NOT_ACCREDITED' | 'NOT_APPLICABLE'
      } else if (rawAccreditation === 'SÍ' || rawAccreditation === 'SI' || rawAccreditation === 'ACREDITADO') {
        parsedAccreditation = 'ACCREDITED'
      } else if (rawAccreditation === 'NO' || rawAccreditation === 'NO ACREDITADO') {
        parsedAccreditation = 'NOT_ACCREDITED'
      } else {
        issues.push({
          row: rowNumber,
          field: 'accreditation_type',
          message: `Tipo de acreditación "${rawAccreditation}" desconocido. Use ACCREDITED, NOT_ACCREDITED o NOT_APPLICABLE.`,
          severity: 'warning',
        })
      }
    }

    // 6. Validar Fecha de Vigencia
    let parsedValidFrom: string | null = null
    if (rawValidFrom) {
      const dateVal = rawValidFrom instanceof Date ? rawValidFrom : new Date(String(rawValidFrom))
      if (!isNaN(dateVal.getTime())) {
        const suspicious = isSuspiciousDate(dateVal)
        if (suspicious.suspicious) {
          issues.push({
            row: rowNumber,
            field: 'valid_from',
            message: `Fecha de vigencia con año atípico (${dateVal.getFullYear()}); verificar posible error de digitación.`,
            severity: 'warning',
          })
        }
        parsedValidFrom = dateVal.toISOString().slice(0, 10)
      }
    }

    const hasBlockingError = issues.some((i) => i.severity === 'error')
    const parsedData: ParsedTestRow = {
      code: rawCode,
      parameter_name: rawParam,
      default_unit: rawUnit || null,
      lcm: parsedLcm,
      uncertainty_text: rawUncertainty || null,
      accreditation_type: parsedAccreditation,
      technique: rawTechnique || null,
      observations: rawObs || null,
      valid_from: parsedValidFrom,
    }

    previewRows.push({
      rowNumber,
      data: parsedData,
      issues,
      isValid: !hasBlockingError,
    })
    allIssues.push(...issues)
  }

  const errorCount = previewRows.filter((r) => !r.isValid).length
  const warningCount = previewRows.filter((r) => r.isValid && r.issues.length > 0).length
  const validCount = previewRows.filter((r) => r.isValid).length

  return {
    target: 'tests',
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
 * Ejecuta la inserción en lote de los ensayos válidos en la base de datos de Supabase.
 * Procesa en fragmentos para evitar bloquear la interfaz.
 */
export async function executeTestBatchImport(
  validRows: ParsedTestRow[],
  onProgress?: (processed: number, total: number) => void,
): Promise<{ importedCount: number; errors: ImportIssue[] }> {
  if (!supabase) {
    throw new Error('Supabase no está disponible.')
  }

  const errors: ImportIssue[] = []
  let importedCount = 0
  const BATCH_SIZE = 25

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const chunk = validRows.slice(i, i + BATCH_SIZE)
    const payloads = chunk.map((r) => ({
      code: r.code,
      parameter_name: r.parameter_name,
      default_unit: r.default_unit,
      lcm: r.lcm,
      uncertainty_text: r.uncertainty_text,
      accreditation_type: r.accreditation_type,
      technique: r.technique,
      observations: r.observations,
      valid_from: r.valid_from,
      active: true,
    }))

    const { error } = await supabase.from('tests').insert(payloads)
    if (!error) {
      importedCount += chunk.length
    } else {
      // Una colisión concurrente en una fila no debe impedir importar el resto del lote.
      for (let offset = 0; offset < chunk.length; offset += 1) {
        const { error: rowError } = await supabase.from('tests').insert(payloads[offset])
        if (rowError) {
          errors.push({
            row: i + offset + 1,
            message: `Error al importar fila: ${rowError.message}`,
            severity: 'error',
          })
        } else {
          importedCount += 1
        }
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, validRows.length), validRows.length)
    }

    // Ceder brevemente al event loop
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return { importedCount, errors }
}
