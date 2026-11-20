import { useMemo, useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { supabase } from '../../lib/supabase'
import { listClients } from '../../services/commercial'
import { getSampleOptions } from '../../services/samples'
import type { ColumnMapping, ImportPreviewResult, ImportTarget } from './types'
import { downloadErrorReport } from './errorReport'
import {
  computeFileHash,
  getWorkbookSheets,
  loadWorkbook,
  MAX_FILE_SIZE_BYTES,
  readSheetRawRows,
} from './excelReader'
import { getTargetFields, suggestColumnMapping } from './targetFields'
import {
  executeSampleBatchImport,
  validateSampleRows,
  type ParsedSampleRow,
  type SampleReferenceContext,
} from './sampleImportService'
import { executeTestBatchImport, validateTestRows, type ParsedTestRow } from './testImportService'

interface ExcelImportModalProps {
  open: boolean
  target: ImportTarget
  onClose: () => void
  onImported: () => void
}

function duplicateWarning(row: { issues: Array<{ message: string }> }): boolean {
  return row.issues.some((issue) => issue.message.includes('ya existe en el sistema'))
}

export function ExcelImportModal({ open, target, onClose, onImported }: ExcelImportModalProps) {
  const [fileName, setFileName] = useState('')
  const [fileHash, setFileHash] = useState('')
  const [workbook, setWorkbook] = useState<Awaited<ReturnType<typeof loadWorkbook>> | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [preview, setPreview] = useState<ImportPreviewResult<ParsedSampleRow | ParsedTestRow> | null>(null)
  const [fileAlreadyImported, setFileAlreadyImported] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [testCodes, setTestCodes] = useState<Set<string> | null>(null)
  const [sampleContext, setSampleContext] = useState<SampleReferenceContext | null>(null)

  const sheets = useMemo(() => workbook ? getWorkbookSheets(workbook) : [], [workbook])
  const fields = getTargetFields(target)
  const selectedSheet = workbook?.getWorksheet(sheetName)
  const selectedSheetData = useMemo(() => selectedSheet ? readSheetRawRows(selectedSheet) : null, [selectedSheet])

  const validateSelection = async (
    activeWorkbook: NonNullable<typeof workbook>,
    activeSheetName: string,
    activeMapping: ColumnMapping,
    activeFileName = fileName,
    activeFileHash = fileHash,
    cachedTestCodes: Set<string> | null = testCodes,
    cachedSampleContext: SampleReferenceContext | null = sampleContext,
  ) => {
    const worksheet = activeWorkbook.getWorksheet(activeSheetName)
    if (!worksheet) return
    setLoading(true)
    setError(null)
    setPreview(null)
    try {
      const raw = readSheetRawRows(worksheet)
      if (raw.totalRows > raw.rows.length) {
        throw new Error(`La hoja tiene ${raw.totalRows.toLocaleString()} filas; el límite es ${raw.rows.length.toLocaleString()}. Divide el archivo para continuar.`)
      }

      let nextPreview: ImportPreviewResult<ParsedSampleRow | ParsedTestRow>
      if (target === 'tests') {
        if (!cachedTestCodes) throw new Error('No se pudieron cargar los códigos de ensayos existentes.')
        nextPreview = await validateTestRows(raw.rows, activeMapping, activeFileName, activeFileHash, activeSheetName, cachedTestCodes)
      } else {
        if (!cachedSampleContext) throw new Error('No se pudieron cargar las referencias de muestras existentes.')
        nextPreview = await validateSampleRows(raw.rows, activeMapping, activeFileName, activeFileHash, activeSheetName, cachedSampleContext)
      }
      setPreview(nextPreview)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo validar la hoja.')
    } finally {
      setLoading(false)
    }
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setPreview(null)
    setResult(null)
    setFileAlreadyImported(false)
    if (!file.name.toLocaleLowerCase().endsWith('.xlsx')) {
      setError('Selecciona un archivo .xlsx. No se aceptan libros con macros.')
      return
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`El archivo supera el límite de ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB.`)
      return
    }
    setLoading(true)
    try {
      const buffer = await file.arrayBuffer()
      const parsedWorkbook = await loadWorkbook(buffer)
      const availableSheets = getWorkbookSheets(parsedWorkbook)
      if (!availableSheets.length) throw new Error('El libro no tiene hojas disponibles.')
      setFileName(file.name)
      const hash = await computeFileHash(buffer)
      setFileHash(hash)
      if (!supabase) throw new Error('Supabase no está disponible.')
      const { data: alreadyImported, error: duplicateCheckError } = await supabase.rpc('has_excel_import', {
        import_target: target,
        import_file_hash: hash,
      })
      if (duplicateCheckError) throw duplicateCheckError
      if (alreadyImported) {
        setFileAlreadyImported(true)
        setResult('Este archivo ya fue importado. No se volverán a crear sus registros.')
        return
      }
      setFileAlreadyImported(false)
      let loadedTestCodes: Set<string> | null = null
      let loadedSampleContext: SampleReferenceContext | null = null
      if (target === 'tests') {
        const { data, error: queryError } = await supabase.from('tests').select('code')
        if (queryError) throw queryError
        loadedTestCodes = new Set((data ?? []).map((row) => String(row.code)))
        setTestCodes(loadedTestCodes)
        setSampleContext(null)
      } else {
        const [clients, options, samples] = await Promise.all([
          listClients(),
          getSampleOptions(),
          supabase.from('samples').select('code'),
        ])
        if (samples.error) throw samples.error
        loadedSampleContext = {
          clients,
          matrices: options.matrices,
          codePattern: options.codePattern,
          existingCodes: new Set((samples.data ?? []).map((row) => String(row.code))),
        }
        setSampleContext(loadedSampleContext)
        setTestCodes(null)
      }
      setWorkbook(parsedWorkbook)
      const firstSheet = availableSheets[0].name
      const firstWorksheet = parsedWorkbook.getWorksheet(firstSheet)
      if (!firstWorksheet) throw new Error('No se pudo abrir la primera hoja.')
      const suggested = suggestColumnMapping(readSheetRawRows(firstWorksheet).headers, target)
      setSheetName(firstSheet)
      setMapping(suggested)
      await validateSelection(parsedWorkbook, firstSheet, suggested, file.name, hash, loadedTestCodes, loadedSampleContext)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo leer el archivo Excel.')
    } finally {
      setLoading(false)
    }
  }

  const updateMapping = (field: string, source: string) => {
    const next = { ...mapping, [field]: source }
    setMapping(next)
    if (workbook && sheetName) void validateSelection(workbook, sheetName, next)
  }

  const updateSheet = (name: string) => {
    if (!workbook) return
    const nextSheet = workbook.getWorksheet(name)
    if (!nextSheet) return
    const suggested = suggestColumnMapping(readSheetRawRows(nextSheet).headers, target)
    setSheetName(name)
    setMapping(suggested)
    void validateSelection(workbook, name, suggested)
  }

  const validRows = (preview?.rows ?? []).filter((row) => row.isValid && !duplicateWarning(row))
  const duplicateCount = (preview?.rows ?? []).filter(duplicateWarning).length

  const confirmImport = async () => {
    if (!preview) return
    setImporting(true)
    setError(null)
    setProgress({ processed: 0, total: validRows.length })
    try {
      const onProgress = (processed: number, total: number) => setProgress({ processed, total })
      const imported = target === 'tests'
        ? await executeTestBatchImport(validRows.map((row) => row.data as ParsedTestRow), onProgress)
        : await executeSampleBatchImport(validRows.map((row) => row.data as ParsedSampleRow), onProgress)
      if (imported.importedCount > 0) {
        if (!supabase) throw new Error('Las filas se importaron, pero no se pudo registrar la auditoría: Supabase no está disponible.')
        const importComplete = imported.errors.length === 0 && preview.errorCount === 0
        const { data: recorded, error: auditError } = await supabase.rpc('record_excel_import', {
          import_target: target,
          import_file_hash: fileHash,
          import_file_name: fileName,
          import_total_attempted: preview.totalRows,
          import_imported_count: imported.importedCount,
          import_complete: importComplete,
        })
        if (auditError) throw new Error(`Las filas se importaron, pero falló el registro de auditoría: ${auditError.message}`)
        if (!recorded) throw new Error('Las filas se importaron, pero este archivo ya estaba registrado por otra sesión.')
        setFileAlreadyImported(importComplete)
      }
      setPreview((current) => current ? {
        ...current,
        issues: [...current.issues, ...imported.errors],
      } : current)
      setResult(`${imported.importedCount} fila(s) importada(s). ${duplicateCount} duplicada(s) omitida(s). ${imported.errors.length} con error de importación.`)
      onImported()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la importación.')
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  const close = () => {
    if (loading || importing) return
    setFileName('')
    setFileHash('')
    setTestCodes(null)
    setSampleContext(null)
    setWorkbook(null)
    setSheetName('')
    setMapping({})
    setPreview(null)
    setFileAlreadyImported(false)
    setError(null)
    setResult(null)
    onClose()
  }

  const issues = preview?.issues ?? []
  return (
    <Modal open={open} onClose={close} title={`Importar ${target === 'tests' ? 'ensayos' : 'muestras'} desde Excel`}>
      <div className="catalog-form">
        <p>Se procesan datos de la hoja seleccionada; las fórmulas no se ejecutan. Revisa el mapeo y las advertencias antes de confirmar.</p>
        <label htmlFor="excel-import-file">Archivo Excel (.xlsx)</label>
        <input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={loading || importing} id="excel-import-file" onChange={(event) => { void handleFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} type="file" />
        {fileName && <p>Archivo: {fileName} · SHA-256: <code>{fileHash}</code></p>}
        {error && <ErrorState message={error} />}
        {sheets.length > 0 && (
          <>
            <label htmlFor="excel-import-sheet">Hoja</label>
            <select disabled={loading || importing} id="excel-import-sheet" onChange={(event) => updateSheet(event.target.value)} value={sheetName}>
              {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name} ({sheet.rowCount} filas)</option>)}
            </select>
            <h3>Mapeo de columnas</h3>
            {fields.map((field) => (
              <label key={field.key}>
                {field.label}{field.required ? ' *' : ' (opcional)'}
                <select disabled={loading || importing || !selectedSheet} onChange={(event) => updateMapping(field.key, event.target.value)} value={mapping[field.key] ?? ''}>
                  <option value="">No mapear</option>
                  {selectedSheetData?.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </>
        )}
        {loading && <p role="status">Leyendo y validando filas…</p>}
        {fileAlreadyImported && <p role="status">Este hash de archivo ya tiene una importación registrada.</p>}
        {preview && (
          <>
            <p role="status">{preview.validCount} válidas · {preview.errorCount} con errores · {preview.warningCount} con advertencias · {duplicateCount} duplicadas omitidas.</p>
            {target === 'samples' && preview.rows.some((row) => row.requiresManualStructuring) && (
              <p role="note">Las filas con menciones de laboratorios externos requieren estructurar el envío manualmente después de la recepción.</p>
            )}
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Fila</th><th>Identificador</th><th>Datos</th><th>Validación</th></tr></thead>
                <tbody>{preview.rows.slice(0, 100).map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{String((row.data as Partial<ParsedTestRow & ParsedSampleRow>).code ?? '')}</td>
                    <td>{JSON.stringify(row.data as unknown as Record<string, unknown>)}</td>
                    <td>{row.issues.length ? row.issues.map((issue) => `${issue.severity === 'error' ? 'Error' : 'Advertencia'}: ${issue.message}`).join(' · ') : 'Lista'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {preview.rows.length > 100 && <p>Vista previa limitada a 100 filas. Se validaron todas las filas.</p>}
            {issues.length > 0 && <button disabled={importing} onClick={() => downloadErrorReport(issues, fileName, target)} type="button">Descargar informe de errores</button>}
          </>
        )}
        {result && <p role="status">{result}</p>}
        {progress && <p role="status">Importando {progress.processed} de {progress.total}…</p>}
        <div className="catalog-form-actions">
          <button disabled={loading || importing} onClick={close} type="button">Cerrar</button>
          <button className="catalog-primary-button" disabled={!preview || loading || importing || fileAlreadyImported || validRows.length === 0} onClick={() => void confirmImport()} type="button">
            {importing ? 'Importando…' : `Importar ${validRows.length} filas válidas`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
