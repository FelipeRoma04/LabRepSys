import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import { formatResult } from '../lib/format'
import { parseResult } from '../lib/parseResult'
import { createStorageSignedUrl } from '../services/storage'
import {
  confirmImportRow,
  correctResult,
  findDuplicateImport,
  getResultLoadOptions,
  listImportRows,
  listResultCorrections,
  listResults,
  saveResultImport,
} from '../services/results'
import type {
  ImportRow,
  Result,
  ResultCorrection,
  ResultImportRowDraft,
  ResultLoadOptions,
} from '../types/results'
import { supabase } from '../lib/supabase'

type TabKey = 'pdf' | 'paste' | 'manual'
type ImportRowView = ImportRow & { parseWarning?: string }

interface PasteGrid {
  headers: string[]
  rows: string[][]
}

interface EditableRow {
  external_parameter: string
  external_unit: string
  external_result: string
  external_uncertainty: string
  external_lcm: string
  external_method: string
  mapped_test_id: string
  mapping_status: 'EXACT' | 'SUGGESTED' | 'UNMAPPED'
  confirmedByUser: boolean
}

const emptyRow = (): EditableRow => ({
  external_parameter: '',
  external_unit: '',
  external_result: '',
  external_uncertainty: '',
  external_lcm: '',
  external_method: '',
  mapped_test_id: '',
  mapping_status: 'UNMAPPED',
  confirmedByUser: false,
})

function splitPasteLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === delimiter && !quoted) {
      cells.push(cell)
      cell = ''
    } else {
      cell += character
    }
  }
  cells.push(cell)
  return cells
}

function parsePasteGrid(value: string): PasteGrid {
  const lines = value.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) throw new Error('Pega al menos una fila de datos.')
  const delimiter = lines.some((line) => line.includes('\t')) ? '\t' : ','
  const parsed = lines.map((line) => splitPasteLine(line, delimiter))
  const firstRow = parsed[0].map((cell) => cell.trim().toLocaleLowerCase())
  const hasHeader = firstRow.some((cell) =>
    /par[aá]metro|parameter|unidad|unit|resultado|result/.test(cell),
  )
  const headers = hasHeader
    ? parsed[0].map((cell, index) => cell.trim() || `Columna ${index + 1}`)
    : parsed[0].map((_, index) => `Columna ${index + 1}`)
  const rows = hasHeader ? parsed.slice(1) : parsed
  return { headers, rows }
}

function headerColumn(headers: string[], pattern: RegExp, fallback: number): number {
  const found = headers.findIndex((header) => pattern.test(header.toLocaleLowerCase()))
  return found >= 0 ? found : Math.min(fallback, Math.max(headers.length - 1, 0))
}

function fileSha256(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Este navegador no ofrece SHA-256 en el contexto actual; use HTTPS o localhost.')
  }
  return file.arrayBuffer()
    .then((buffer) => crypto.subtle.digest('SHA-256', buffer))
    .then((hash) => Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''))
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_. -]/g, '_').replace(/^\.+/, '')
  return cleaned || 'informe.pdf'
}

function localDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('es-CO') : '—'
}

function rowToDraft(row: EditableRow): ResultImportRowDraft {
  const parsedLcm = row.external_lcm.trim()
    ? parseResult(row.external_lcm)
    : null
  if (parsedLcm && (parsedLcm.type !== 'numeric' || parsedLcm.operator)) {
    throw new Error(`El LCM de "${row.external_parameter || 'la fila'}" debe ser numérico y no ambiguo.`)
  }
  return {
    external_parameter: row.external_parameter.trim(),
    external_unit: row.external_unit.trim() || null,
    external_result: row.external_result,
    external_uncertainty: row.external_uncertainty || null,
    external_lcm: parsedLcm?.numericValue ?? null,
    external_method: row.external_method.trim() || null,
    mapped_test_id: row.mapped_test_id || null,
    mapping_status: row.mapping_status,
    validation_messages: [],
  }
}

export function ResultsLoadPage() {
  const [searchParams] = useSearchParams()
  const { roles } = useAuth()
  const canWrite = roles.some((role) => ['ADMIN', 'ANALISTA'].includes(role.code))
  const [tab, setTab] = useState<TabKey>('paste')
  const [options, setOptions] = useState<ResultLoadOptions | null>(null)
  const [sampleId, setSampleId] = useState(() => searchParams.get('sample_id') ?? '')
  const [laboratoryId, setLaboratoryId] = useState(() => searchParams.get('laboratory_id') ?? '')
  const [pasteText, setPasteText] = useState('')
  const [pasteGrid, setPasteGrid] = useState<PasteGrid | null>(null)
  const [parameterColumn, setParameterColumn] = useState(0)
  const [unitColumn, setUnitColumn] = useState(1)
  const [resultColumn, setResultColumn] = useState(2)
  const [rows, setRows] = useState<ImportRowView[]>([])
  const [manualRows, setManualRows] = useState<EditableRow[]>([emptyRow()])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileHash, setFileHash] = useState<string | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [storedPdfUrl, setStoredPdfUrl] = useState<string | null>(null)
  const [duplicateImportId, setDuplicateImportId] = useState<string | null>(null)
  const [importId, setImportId] = useState<string | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [corrections, setCorrections] = useState<Record<string, ResultCorrection[]>>({})
  const [selectedResult, setSelectedResult] = useState<Result | null>(null)
  const [correctedText, setCorrectedText] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const selectedSample = options?.samples.find((sample) => sample.id === sampleId) ?? null
  const selectedLab = options?.laboratories.find((laboratory) => laboratory.id === laboratoryId) ?? null
  const availableTests = useMemo(() => options?.tests ?? [], [options])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const loadOptions = await getResultLoadOptions()
      setOptions(loadOptions)
      if (!sampleId && loadOptions.samples[0]) setSampleId(loadOptions.samples[0].id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las opciones de resultados.')
    } finally {
      setLoading(false)
    }
  }, [sampleId])

  const loadSelectedResults = useCallback(async () => {
    if (!sampleId) {
      setResults([])
      setCorrections({})
      return
    }
    try {
      const resultRows = await listResults(sampleId)
      setResults(resultRows)
      const correctionPairs = await Promise.all(resultRows.map(async (result) => [
        result.id,
        await listResultCorrections(result.id),
      ] as const))
      setCorrections(Object.fromEntries(correctionPairs))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los resultados guardados.')
    }
  }, [sampleId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSelectedResults(), 0)
    return () => window.clearTimeout(timer)
  }, [loadSelectedResults])

  useEffect(() => () => {
    if (pdfPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(pdfPreviewUrl)
  }, [pdfPreviewUrl])

  const matchTest = useCallback((externalParameter: string): {
    id: string
    status: EditableRow['mapping_status']
  } => {
    if (!options || !laboratoryId || !externalParameter.trim()) {
      return { id: '', status: 'UNMAPPED' }
    }
    const normalizedName = externalParameter.trim().toLocaleLowerCase()
    const matchingIds = new Set(options.aliases
      .filter((alias) =>
        alias.external_name.trim().toLocaleLowerCase() === normalizedName &&
        (alias.laboratory_id === null || alias.laboratory_id === laboratoryId),
      )
      .map((alias) => alias.test_id))
    if (matchingIds.size !== 1) return { id: '', status: 'UNMAPPED' }
    return { id: [...matchingIds][0], status: 'EXACT' }
  }, [laboratoryId, options])

  const toViewRows = useCallback((drafts: ResultImportRowDraft[]): ImportRowView[] =>
    drafts.map((draft, index) => ({
      id: `draft-${index}`,
      result_import_id: importId ?? '',
      row_number: index + 1,
      ...draft,
      external_parameter: draft.external_parameter,
      external_unit: draft.external_unit,
      external_result: draft.external_result,
      mapped_test_id: draft.mapped_test_id,
      confirmed: false,
    })), [importId])

  const processPaste = () => {
    setError(null)
    try {
      const grid = parsePasteGrid(pasteText)
      setPasteGrid(grid)
      setParameterColumn(headerColumn(grid.headers, /par[aá]metro|parameter/, 0))
      setUnitColumn(headerColumn(grid.headers, /unidad|unit/, 1))
      setResultColumn(headerColumn(grid.headers, /resultado|result|valor/, 2))
      setNotice('Pega texto tabulado desde Excel. Verifica las columnas antes de generar la vista previa.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo procesar el texto pegado.')
    }
  }

  const previewPastedRows = () => {
    if (!pasteGrid) return
    const drafts = pasteGrid.rows.map((cells) => {
      const externalParameter = cells[parameterColumn] ?? ''
      const match = matchTest(externalParameter)
      return {
        ...emptyRow(),
        external_parameter: externalParameter,
        external_unit: cells[unitColumn] ?? '',
        external_result: cells[resultColumn] ?? '',
        mapped_test_id: match.id,
        mapping_status: match.status,
      }
    }).filter((row) => row.external_parameter || row.external_result)
    setRows(toViewRows(drafts.map(rowToDraft)))
    setImportId(null)
    setNotice(null)
  }

  const handlePdfSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setError(null)
    setNotice(null)
    setStoredPdfUrl(null)
    setDuplicateImportId(null)
    setImportId(null)
    setRows([])
    setSelectedFile(null)
    setFileHash(null)
    setPdfPreviewUrl(null)
    if (!file) {
      return
    }
    if (file.type !== 'application/pdf') {
      setError('Seleccione un archivo PDF.')
      event.target.value = ''
      return
    }
    if (!sampleId || !laboratoryId) {
      setError('Seleccione la muestra y el laboratorio antes de seleccionar el PDF.')
      event.target.value = ''
      return
    }
    setSelectedFile(file)
    setPdfPreviewUrl(URL.createObjectURL(file))
    try {
      const hash = await fileSha256(file)
      if (fileInput.current?.files?.[0] !== file) return
      setFileHash(hash)
      const existing = await findDuplicateImport(sampleId, laboratoryId, hash)
      if (fileInput.current?.files?.[0] !== file) return
      if (existing) {
        setDuplicateImportId(existing.id)
        setImportId(existing.id)
        const existingRows = await listImportRows(existing.id)
        setRows(existingRows)
        setNotice(
          existingRows.some((row) => !row.confirmed)
            ? 'Este mismo archivo ya fue cargado. Revisa las filas pendientes para reprocesarlas sin duplicar resultados.'
            : 'Este archivo ya fue procesado para esta muestra y laboratorio; no se crearon resultados duplicados.',
        )
        if (existing.storage_path) {
          try {
            setStoredPdfUrl(await createStorageSignedUrl('source-files', existing.storage_path))
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'No se pudo preparar la vista segura del PDF.')
          }
        }
      } else {
        setNotice('Los adaptadores AGQ, Chemilab e IHA son stubs: la extracción automática está pendiente. El original se conserva y se captura manualmente con el PDF visible.')
        setManualRows([emptyRow()])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo calcular el hash o verificar la idempotencia del archivo.')
    }
  }

  const resetSourceSelection = () => {
    if (fileInput.current) fileInput.current.value = ''
    setRows([])
    setImportId(null)
    setDuplicateImportId(null)
    setSelectedFile(null)
    setFileHash(null)
    setPdfPreviewUrl(null)
    setStoredPdfUrl(null)
    setManualRows([emptyRow()])
    setPasteGrid(null)
    setError(null)
    setNotice(null)
  }

  const saveImport = async (drafts: EditableRow[], sourceType: 'PDF' | 'PASTE' | 'MANUAL') => {
    if (!sampleId || !laboratoryId || !selectedLab) {
      setError('Seleccione la muestra y el laboratorio.')
      return
    }
    let rowDrafts: ResultImportRowDraft[]
    try {
      rowDrafts = drafts
        .filter((row) => row.external_parameter.trim() || row.external_result.trim())
        .map(rowToDraft)
      if (!rowDrafts.length) throw new Error('Agregue al menos una fila con parámetro o resultado.')
      if (rowDrafts.some((row) => !row.external_result.trim())) {
        throw new Error('Cada fila debe conservar el texto original del resultado.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Revise las filas antes de guardarlas.')
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)
    let uploadedStoragePath: string | null = null
    let importSaved = false
    try {
      if (sourceType === 'PDF') {
        if (!selectedFile || !fileHash || !supabase) {
          throw new Error('Seleccione un PDF válido y espere a que termine su verificación.')
        }
        if (duplicateImportId) {
          setNotice('Importación existente abierta. Confirme solo las filas que siguen pendientes.')
          setSaving(false)
          return
        }
        uploadedStoragePath = `samples/${sampleId}/${crypto.randomUUID()}-${safeFileName(selectedFile.name)}`
        const { error: uploadError } = await supabase.storage
          .from('source-files')
          .upload(uploadedStoragePath, selectedFile, {
            cacheControl: '3600',
            contentType: 'application/pdf',
            upsert: false,
          })
        if (uploadError) throw uploadError
      }
      const saved = await saveResultImport({
        sample_id: sampleId,
        laboratory_id: laboratoryId,
        source_type: sourceType,
        storage_path: uploadedStoragePath,
        file_name: sourceType === 'PDF' ? selectedFile?.name : null,
        file_hash: sourceType === 'PDF' ? fileHash : null,
        adapter_code: null,
        adapter_version: null,
        raw_payload: sourceType === 'PASTE' ? { paste: pasteText } : null,
      }, rowDrafts)
      importSaved = true
      setImportId(saved.importId)
      const savedRows = await listImportRows(saved.importId)
      setRows(savedRows)
      setDuplicateImportId(saved.duplicate ? saved.importId : null)
      if (saved.duplicate) {
        setNotice('El mismo archivo ya existe. Se abrió la importación existente; las filas confirmadas no se volverán a insertar.')
      } else {
        setNotice(sourceType === 'PDF'
          ? 'Archivo original guardado sin modificar. Revisa cada fila y confirma sus correspondencias.'
          : 'Importación guardada. Revisa cada fila y confirma sus correspondencias.')
        if (uploadedStoragePath) {
          try {
            setStoredPdfUrl(await createStorageSignedUrl('source-files', uploadedStoragePath))
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'El original se guardó, pero no se pudo preparar la vista previa segura.')
          }
        }
      }
      await loadSelectedResults()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo guardar la importación.'
      setError(uploadedStoragePath && !importSaved
        ? `${message} El PDF quedó cargado en almacenamiento y no se eliminó; informe al administrador para revisar el objeto no asociado.`
        : message)
    } finally {
      setSaving(false)
    }
  }

  const confirmRow = async (row: ImportRowView, manuallyConfirmed: boolean) => {
    const targetTestId = row.mapped_test_id
    if (!targetTestId) {
      setError('Asigne un ensayo SA a la fila antes de confirmarla.')
      return
    }
    if (parseResult(row.external_result ?? '').pendingConfirmation && !manuallyConfirmed) {
      setError('Confirme explícitamente el texto cualitativo antes de guardarlo.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const parsed = parseResult(row.external_result ?? '')
      await confirmImportRow(row.id, targetTestId, {
        operator: parsed.type === 'numeric' ? parsed.operator ?? null : null,
        numeric_value: parsed.type === 'numeric' ? parsed.numericValue ?? null : null,
        source_page: null,
      })
      setRows((current) => current.map((item) =>
        item.id === row.id
          ? { ...item, mapped_test_id: targetTestId, mapping_status: 'CONFIRMED', confirmed: true }
          : item,
      ))
      setNotice(`Fila ${row.row_number} confirmada. El texto original permanece almacenado sin cambios.`)
      await loadSelectedResults()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo confirmar la fila.')
    } finally {
      setSaving(false)
    }
  }

  const handleFileSave = async () => {
    if (!selectedFile) {
      setError('Seleccione el archivo PDF original.')
      return
    }
    const drafts = manualRows
    await saveImport(drafts, 'PDF')
  }

  const updateManualRow = (index: number, field: keyof EditableRow, value: string) => {
    setManualRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      const updated = { ...row, [field]: value }
      if (field === 'external_parameter') {
        const match = matchTest(value)
        updated.mapped_test_id = match.id
        updated.mapping_status = match.status
      } else if (field === 'mapped_test_id') {
        updated.mapping_status = value ? 'SUGGESTED' : 'UNMAPPED'
      }
      return updated
    }))
  }

  const handleCorrection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedResult) return
    setSaving(true)
    setError(null)
    try {
      await correctResult(selectedResult.id, { reported_text: correctedText }, correctionReason)
      setSelectedResult(null)
      setCorrectionReason('')
      setNotice('Corrección registrada aparte con su motivo. El resultado original no fue sobrescrito.')
      await loadSelectedResults()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la corrección.')
    } finally {
      setSaving(false)
    }
  }

  const resultColumns: DataTableColumn<Result>[] = [
    {
      key: 'test',
      header: 'Ensayo',
      render: (result) => options?.tests.find((test) => test.id === result.test_id)?.code ?? result.test_id,
    },
    {
      key: 'result',
      header: 'Resultado original',
      render: (result) => formatResult({
        operator: result.operator,
        numericValue: result.numeric_value,
        originalText: result.original_text,
      }) ?? '—',
    },
    { key: 'unit', header: 'Unidad recibida', render: (result) => result.unit ?? '—' },
    { key: 'analysis', header: 'Análisis', render: (result) => localDateTime(result.analysis_start) },
    { key: 'status', header: 'Estado', render: (result) => <StatusBadge label={result.status} tone="success" /> },
    {
      key: 'corrections',
      header: 'Correcciones registradas',
      render: (result) => (corrections[result.id] ?? []).length
        ? (corrections[result.id] ?? []).map((correction) => (
          <p key={correction.id}>
            {String(correction.new_data.reported_text ?? 'Corrección registrada')} · Motivo: {correction.reason}
          </p>
        ))
        : '—',
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (result) => canWrite
        ? <button className="catalog-file-button" onClick={() => {
          setSelectedResult(result)
          setCorrectedText(result.reported_text ?? result.original_text ?? '')
          setCorrectionReason('')
        }} type="button">Registrar corrección</button>
        : '—',
    },
  ]

  const rowColumns: DataTableColumn<ImportRowView>[] = [
    { key: 'row', header: 'Fila', render: (row) => row.row_number },
    { key: 'parameter', header: 'Parámetro externo', render: (row) => row.external_parameter ?? '—' },
    { key: 'unit', header: 'Unidad recibida', render: (row) => row.external_unit ?? '—' },
    {
      key: 'original',
      header: 'Texto original',
      render: (row) => <code>{row.external_result}</code>,
    },
    {
      key: 'interpretation',
      header: 'Interpretación',
      render: (row) => {
        const parsed = parseResult(row.external_result ?? '')
        return (
          <span>
            {parsed.type === 'numeric'
              ? formatResult({
                operator: parsed.operator,
                numericValue: parsed.numericValue,
                decimalPlaces: parsed.decimalPlaces,
                originalText: parsed.originalText,
              })
              : parsed.type === 'range'
                ? parsed.originalText
                : parsed.type}
            {parsed.pendingConfirmation && <><br /><span className="fielddata-warning">{parsed.confirmationReason}</span></>}
          </span>
        )
      },
    },
    {
      key: 'mapping',
      header: 'Ensayo SA',
      render: (row) => row.confirmed
        ? options?.tests.find((test) => test.id === row.mapped_test_id)?.code ?? 'Confirmado'
        : canWrite
          ? (
            <select
              aria-label={`Ensayo para fila ${row.row_number}`}
              onChange={(event) => {
                setRows((current) => current.map((item) => item.id === row.id ? {
                  ...item,
                  mapped_test_id: event.target.value || null,
                  mapping_status: event.target.value ? 'SUGGESTED' : 'UNMAPPED',
                } : item))
              }}
              value={row.mapped_test_id ?? ''}
            >
              <option value="">Sin correspondencia</option>
              {availableTests.map((test) => <option key={test.id} value={test.id}>{test.code} · {test.parameter_name ?? ''}</option>)}
            </select>
          )
          : row.mapped_test_id
            ? options?.tests.find((test) => test.id === row.mapped_test_id)?.code ?? '—'
            : 'Sin correspondencia',
    },
    {
      key: 'confirmation',
      header: 'Confirmación',
      render: (row) => {
        if (row.confirmed) return <StatusBadge label="Guardado" tone="success" />
        if (!canWrite) return <StatusBadge label="Pendiente" tone="warning" />
        const pending = parseResult(row.external_result ?? '').pendingConfirmation
        return (
          <div className="result-confirm-actions">
            {pending && (
              <label>
                <input
                  checked={row.parseWarning === 'confirmed'}
                  onChange={(event) => setRows((current) => current.map((item) =>
                    item.id === row.id
                      ? { ...item, parseWarning: event.target.checked ? 'confirmed' : undefined }
                      : item,
                  ))}
                  type="checkbox"
                />
                Confirmo este texto tal como está
              </label>
            )}
            <button
              className="catalog-file-button"
              disabled={saving || !row.mapped_test_id || (pending && row.parseWarning !== 'confirmed')}
              onClick={() => void confirmRow(row, row.parseWarning === 'confirmed')}
              type="button"
            >Confirmar y guardar</button>
          </div>
        )
      },
    },
  ]

  const applyExistingImport = async () => {
    if (!duplicateImportId) return
    setSaving(true)
    setError(null)
    try {
      const existingRows = await listImportRows(duplicateImportId)
      setImportId(duplicateImportId)
      setRows(existingRows)
      const existingImport = fileHash
        ? await findDuplicateImport(sampleId, laboratoryId, fileHash)
        : null
      if (existingImport?.storage_path) {
        setStoredPdfUrl(await createStorageSignedUrl('source-files', existingImport.storage_path))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las filas existentes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Carga de resultados"
        description="Captura y confirma los resultados originales por muestra, ensayo y laboratorio. No se convierten unidades ni se adivinan valores."
      />
      {error && <ErrorState title="Error" message={error} />}
      {notice && <p className="catalog-notice" role="status">{notice}</p>}

      {loading ? <LoadingState message="Cargando muestras y catálogos…" /> : options && (
        <section className="result-selection">
          <label>
            Muestra
            <select
              onChange={(event) => {
                resetSourceSelection()
                setSampleId(event.target.value)
                setResults([])
              }}
              value={sampleId}
            >
              {options.samples.map((sample) => (
                <option key={sample.id} value={sample.id}>{sample.code} · {sample.client_name}</option>
              ))}
            </select>
          </label>
          <label>
            Laboratorio del informe
            <select
              onChange={(event) => {
                resetSourceSelection()
                setLaboratoryId(event.target.value)
              }}
              value={laboratoryId}
            >
              <option value="">Seleccione laboratorio</option>
              {options.laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.code} · {lab.name}</option>)}
            </select>
          </label>
        </section>
      )}

      {!loading && !options?.samples.length && (
        <EmptyState title="No hay muestras disponibles" description="Registra primero una muestra y sus ensayos solicitados." />
      )}

      {canWrite && options && (
        <>
          <div className="tabs" role="tablist" aria-label="Método de carga de resultados">
            {([
              ['pdf', 'Desde PDF'],
              ['paste', 'Pegar desde Excel'],
              ['manual', 'Digitación manual'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                aria-selected={tab === key}
                className={`tab${tab === key ? ' tab-active' : ''}`}
                onClick={() => {
                  setTab(key)
                  setError(null)
                  setNotice(null)
                  setRows([])
                  setImportId(null)
                  setDuplicateImportId(null)
                }}
                role="tab"
                type="button"
              >{label}</button>
            ))}
          </div>

          {tab === 'pdf' && (
            <section className="load-section">
              <p className="load-note">
                Se guarda el PDF original sin modificar con SHA-256. Los adaptadores AGQ, Chemilab e IHA aún no extraen datos; no hay OCR. Revise el documento visible y capture o pegue las filas manualmente.
              </p>
              <label className="file-upload-label">
                Seleccionar PDF original
                <input
                  accept="application/pdf"
                  onChange={(event) => void handlePdfSelected(event)}
                  ref={fileInput}
                  type="file"
                />
              </label>
              {selectedFile && <p>Archivo: {selectedFile.name} · {fileHash ? `SHA-256 ${fileHash}` : 'Calculando SHA-256…'}</p>}
              {duplicateImportId && (
                <div className="load-warning" role="status">
                  <strong>Archivo ya importado:</strong> se recuperarán las filas pendientes sin duplicar los resultados existentes.
                  <button className="catalog-file-button" disabled={saving} onClick={() => void applyExistingImport()} type="button">
                    Reprocesar filas pendientes
                  </button>
                </div>
              )}
              {selectedFile && (
                <div className="result-pdf-review">
                  <h2>PDF original para revisión humana</h2>
                  <iframe
                    title={`Vista previa de ${selectedFile.name}`}
                    src={storedPdfUrl ?? pdfPreviewUrl ?? undefined}
                  />
                </div>
              )}
            </section>
          )}

          {tab === 'paste' && (
            <section className="load-section">
              <label>
                Pega una grilla tabulada desde Excel (encabezados opcionales)
                <textarea
                  className="paste-area"
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder={'Parámetro\tUnidad\tResultado\npH\tunidades\t7,2\nPlomo\tmg/L\t< 0,040'}
                  rows={8}
                  value={pasteText}
                />
              </label>
              <button className="catalog-file-button" disabled={!pasteText.trim()} onClick={processPaste} type="button">
                Leer columnas
              </button>
              {pasteGrid && (
                <div className="paste-column-mapping">
                  {([
                    ['Parámetro', parameterColumn, setParameterColumn],
                    ['Unidad', unitColumn, setUnitColumn],
                    ['Resultado original', resultColumn, setResultColumn],
                  ] as const).map(([label, value, setter]) => (
                    <label key={label}>
                      {label}
                      <select onChange={(event) => setter(Number(event.target.value))} value={value}>
                        {pasteGrid.headers.map((header, index) => (
                          <option key={`${header}-${index}`} value={index}>{header}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <button className="catalog-primary-button" onClick={previewPastedRows} type="button">
                    Vista previa de filas
                  </button>
                </div>
              )}
            </section>
          )}

          {tab === 'manual' && (
            <section className="load-section">
              <h2>Digitación manual</h2>
              <p>Escriba literalmente lo recibido. Las unidades y la incertidumbre no se convierten ni se normalizan.</p>
              {manualRows.map((row, index) => (
                <div className="result-manual-row" key={`manual-${index}`}>
                  <label>Parámetro externo<input onChange={(event) => updateManualRow(index, 'external_parameter', event.target.value)} value={row.external_parameter} /></label>
                  <label>Unidad recibida<input onChange={(event) => updateManualRow(index, 'external_unit', event.target.value)} value={row.external_unit} /></label>
                  <label>Resultado original<input onChange={(event) => updateManualRow(index, 'external_result', event.target.value)} value={row.external_result} /></label>
                  <label>Incertidumbre recibida<input onChange={(event) => updateManualRow(index, 'external_uncertainty', event.target.value)} value={row.external_uncertainty} /></label>
                  <label>LCM recibido<input onChange={(event) => updateManualRow(index, 'external_lcm', event.target.value)} value={row.external_lcm} /></label>
                  <label>Método recibido<input onChange={(event) => updateManualRow(index, 'external_method', event.target.value)} value={row.external_method} /></label>
                  <label>Ensayo SA
                    <select onChange={(event) => updateManualRow(index, 'mapped_test_id', event.target.value)} value={row.mapped_test_id}>
                      <option value="">Seleccione o deje sin mapear</option>
                      {availableTests.map((test) => <option key={test.id} value={test.id}>{test.code} · {test.parameter_name ?? ''}</option>)}
                    </select>
                  </label>
                  <button
                    aria-label={`Quitar fila ${index + 1}`}
                    className="catalog-file-button"
                    disabled={manualRows.length === 1}
                    onClick={() => setManualRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                    type="button"
                  >Quitar fila</button>
                </div>
              ))}
              <div className="catalog-form-actions">
                <button className="catalog-file-button" onClick={() => setManualRows((current) => [...current, emptyRow()])} type="button">Agregar fila</button>
                <button className="catalog-primary-button" disabled={saving} onClick={() => void saveImport(manualRows, 'MANUAL')} type="button">
                  Guardar captura manual
                </button>
              </div>
            </section>
          )}

          {tab === 'paste' && pasteGrid && (
            <div className="catalog-form-actions">
              <button className="catalog-primary-button" disabled={saving || !rows.length} onClick={() => {
                  const drafts: EditableRow[] = rows.map((row) => ({
                  ...emptyRow(),
                  external_parameter: row.external_parameter ?? '',
                  external_unit: row.external_unit ?? '',
                  external_result: row.external_result ?? '',
                  mapped_test_id: row.mapped_test_id ?? '',
                  mapping_status: row.mapping_status === 'EXACT' || row.mapping_status === 'SUGGESTED'
                    ? row.mapping_status
                    : 'UNMAPPED',
                }))
                void saveImport(drafts, 'PASTE')
              }} type="button">Guardar importación pegada</button>
            </div>
          )}

          {tab === 'pdf' && selectedFile && !duplicateImportId && (
            <section className="result-pdf-capture">
              <h2>Filas capturadas del PDF</h2>
              {manualRows.map((row, index) => (
                <div className="result-manual-row" key={`pdf-${index}`}>
                  <label>Parámetro externo<input onChange={(event) => updateManualRow(index, 'external_parameter', event.target.value)} value={row.external_parameter} /></label>
                  <label>Unidad recibida<input onChange={(event) => updateManualRow(index, 'external_unit', event.target.value)} value={row.external_unit} /></label>
                  <label>Resultado original<input onChange={(event) => updateManualRow(index, 'external_result', event.target.value)} value={row.external_result} /></label>
                  <label>Incertidumbre recibida<input onChange={(event) => updateManualRow(index, 'external_uncertainty', event.target.value)} value={row.external_uncertainty} /></label>
                  <label>LCM recibido<input onChange={(event) => updateManualRow(index, 'external_lcm', event.target.value)} value={row.external_lcm} /></label>
                  <label>Método recibido<input onChange={(event) => updateManualRow(index, 'external_method', event.target.value)} value={row.external_method} /></label>
                  <label>Ensayo SA
                    <select onChange={(event) => updateManualRow(index, 'mapped_test_id', event.target.value)} value={row.mapped_test_id}>
                      <option value="">Seleccione o deje sin mapear</option>
                      {availableTests.map((test) => <option key={test.id} value={test.id}>{test.code} · {test.parameter_name ?? ''}</option>)}
                    </select>
                  </label>
                  <button aria-label={`Quitar fila ${index + 1}`} className="catalog-file-button" disabled={manualRows.length === 1} onClick={() => setManualRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} type="button">Quitar fila</button>
                </div>
              ))}
              <div className="catalog-form-actions">
                <button className="catalog-file-button" onClick={() => setManualRows((current) => [...current, emptyRow()])} type="button">Agregar fila</button>
                <button className="catalog-primary-button" disabled={saving || !fileHash} onClick={() => void handleFileSave()} type="button">
                  {saving ? 'Guardando…' : 'Guardar PDF y filas'}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {rows.length > 0 && (
        <section className="result-import-review">
          <h2>Revisión de importación{importId ? ` · ${importId}` : ''}</h2>
          <DataTable caption="Filas de resultados para confirmar" columns={rowColumns} rowKey={(row) => row.id} rows={rows} />
        </section>
      )}

      {!canWrite && (
        <section className="result-readonly-note">
          <p>Modo de consulta: solo ANALISTA y ADMIN pueden importar, confirmar o registrar correcciones.</p>
        </section>
      )}

      <section className="result-saved-list">
        <h2>Resultados registrados{selectedSample ? ` · ${selectedSample.code}` : ''}</h2>
        {loading ? <LoadingState message="Cargando resultados…" /> :
          results.length
            ? <DataTable caption="Resultados registrados de la muestra" columns={resultColumns} rowKey={(result) => result.id} rows={results} />
            : <EmptyState title="Sin resultados registrados" description="Los resultados confirmados de esta muestra aparecerán aquí." />}
      </section>

      <Modal
        open={!!selectedResult}
        title={selectedResult ? `Registrar corrección · ${options?.tests.find((test) => test.id === selectedResult.test_id)?.code ?? 'Resultado'}` : 'Registrar corrección'}
        onClose={() => !saving && setSelectedResult(null)}
      >
        <form className="catalog-form" onSubmit={(event) => void handleCorrection(event)}>
          <p>La corrección se guarda como una entrada separada con motivo. El texto y valor originales no se modifican.</p>
          <label>Texto corregido (tal como debe registrarse)
            <textarea required onChange={(event) => setCorrectedText(event.target.value)} value={correctedText} />
          </label>
          <label>Motivo de la corrección
            <textarea required onChange={(event) => setCorrectionReason(event.target.value)} value={correctionReason} />
          </label>
          <div className="catalog-form-actions">
            <button className="catalog-primary-button" disabled={saving || !correctedText.trim() || !correctionReason.trim()} type="submit">
              {saving ? 'Guardando…' : 'Registrar corrección sin sobrescribir el original'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
