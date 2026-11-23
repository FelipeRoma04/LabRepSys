/**
 * Carga rápida (Bloque B, tarea 5): reemplaza el paso de la macro.
 * Elegir muestra → soltar los PDF de los laboratorios → revisar solo lo dudoso
 * → «Generar borrador». La carga clásica sigue disponible para captura manual.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import {
  DOUBT_LABELS,
  applyLearnedAlias,
  buildQuickRows,
  canLearnAlias,
  detectLaboratoryId,
  isDoubtful,
  isRowReady,
  remapRows,
  rowsForSample,
  suggestSampleColumn,
  type QuickRow,
} from '../features/quickload/quickLoad'
import {
  generateDraft,
  isDuplicatePdf,
  learnTestAlias,
  listApprovedTemplates,
  readPdf,
  type PdfReading,
} from '../features/quickload/quickLoadService'
import { getResultLoadOptions } from '../services/results'
import type { ResultLoadOptions } from '../types/results'

interface QuickFile {
  key: string
  file: File
  reading: PdfReading | null
  laboratoryId: string
  labAutoDetected: boolean
  /** Columna del informe (si trae varias muestras) que corresponde a la muestra */
  columnIndex: number | null
  duplicate: boolean
  error: string | null
}

export function QuickLoadPage() {
  const navigate = useNavigate()
  const [options, setOptions] = useState<ResultLoadOptions | null>(null)
  const [templates, setTemplates] = useState<{ id: string; code: string; version: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sampleId, setSampleId] = useState('')
  const [files, setFiles] = useState<QuickFile[]>([])
  const [rows, setRows] = useState<QuickRow[]>([])
  const [showAll, setShowAll] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const fileCounter = useRef(0)

  useEffect(() => {
    let active = true
    Promise.all([getResultLoadOptions(), listApprovedTemplates()])
      .then(([loaded, approved]) => {
        if (!active) return
        setOptions(loaded)
        setTemplates(approved)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las muestras.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const sample = options?.samples.find((item) => item.id === sampleId) ?? null
  const testsById = useMemo(
    () => new Map((options?.tests ?? []).map((test) => [test.id, test])),
    [options],
  )

  const addFiles = async (incoming: File[]) => {
    if (!options || !sampleId) {
      setError('Elige primero la muestra.')
      return
    }
    setError(null)
    const pdfs = incoming.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length < incoming.length) setError('Solo se aceptan archivos PDF; los demás se ignoraron.')
    const pending = pdfs.map((file) => {
      fileCounter.current += 1
      return {
        key: `f${fileCounter.current}`,
        file,
        reading: null,
        laboratoryId: '',
        labAutoDetected: false,
        columnIndex: null,
        duplicate: false,
        error: null,
      } satisfies QuickFile
    })
    setFiles((current) => [...current, ...pending])

    for (const item of pending) {
      const reading = await readPdf(item.file)
      const laboratoryId = detectLaboratoryId(reading.adapterId, options.laboratories) ?? ''
      const sampleCode = options.samples.find((candidate) => candidate.id === sampleId)?.code ?? ''
      const columnIndex = reading.result.sampleColumns
        ? suggestSampleColumn(reading.result.sampleColumns, sampleCode)
        : null
      let duplicate = false
      if (laboratoryId) {
        try {
          duplicate = await isDuplicatePdf(sampleId, laboratoryId, reading.hash)
        } catch {
          duplicate = false
        }
      }
      setFiles((current) => current.map((candidate) => candidate.key === item.key
        ? { ...candidate, reading, laboratoryId, labAutoDetected: Boolean(laboratoryId), columnIndex, duplicate }
        : candidate))
      if (!duplicate) {
        setRows((current) => [
          ...current,
          ...buildQuickRows(item.key, rowsForSample(reading.result, columnIndex), laboratoryId || null, options.aliases),
        ])
      }
    }
  }

  const changeLaboratory = (fileKey: string, laboratoryId: string) => {
    if (!options) return
    setFiles((current) => current.map((item) => item.key === fileKey
      ? { ...item, laboratoryId, labAutoDetected: false }
      : item))
    setRows((current) => [
      ...current.filter((row) => row.fileKey !== fileKey),
      ...remapRows(current.filter((row) => row.fileKey === fileKey), laboratoryId || null, options.aliases),
    ])
  }

  const changeColumn = (fileKey: string, value: string) => {
    if (!options) return
    const file = files.find((item) => item.key === fileKey)
    if (!file?.reading) return
    const columnIndex = value === '' ? null : Number(value)
    setFiles((current) => current.map((item) => item.key === fileKey ? { ...item, columnIndex } : item))
    setRows((current) => [
      ...current.filter((row) => row.fileKey !== fileKey),
      ...buildQuickRows(fileKey, rowsForSample(file.reading!.result, columnIndex), file.laboratoryId || null, options.aliases),
    ])
  }

  const removeFile = (fileKey: string) => {
    setFiles((current) => current.filter((item) => item.key !== fileKey))
    setRows((current) => current.filter((row) => row.fileKey !== fileKey))
  }

  const updateRow = (key: string, patch: Partial<QuickRow>) => {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row))
  }

  const rememberAlias = async (row: QuickRow) => {
    const file = files.find((item) => item.key === row.fileKey)
    if (!options || !file?.laboratoryId) return
    setError(null)
    const alias = { testId: row.mappedTestId, laboratoryId: file.laboratoryId, externalName: row.externalParameter }
    const response = await learnTestAlias(alias)
    if (!response.ok) {
      setError(response.message ?? 'No se pudo guardar el alias.')
      return
    }
    setOptions({
      ...options,
      aliases: [...options.aliases, {
        test_id: alias.testId,
        laboratory_id: alias.laboratoryId,
        external_name: alias.externalName,
      }],
    })
    setRows((current) => applyLearnedAlias(
      current,
      new Map(files.map((item) => [item.key, item.laboratoryId])),
      alias,
    ))
    setNotice(`«${alias.externalName}» quedó guardado como alias para la próxima carga.`)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    void addFiles(Array.from(event.dataTransfer.files))
  }

  const usableFiles = files.filter((item) => item.reading && !item.duplicate && item.laboratoryId)
  const usableRows = rows.filter((row) => usableFiles.some((item) => item.key === row.fileKey))
  const doubtfulRows = usableRows.filter(isDoubtful)
  const safeRows = usableRows.filter((row) => !isDoubtful(row))
  const pendingRows = usableRows.filter((row) => !isRowReady(row))
  const includedRows = usableRows.filter((row) => !row.excluded)
  const stillReading = files.some((item) => !item.reading)
  const filesWithoutLab = files.filter((item) => item.reading && !item.duplicate && !item.laboratoryId
    && (item.reading.result.rows.length > 0 || Boolean(item.reading.result.sampleColumns?.length)))
  const filesWithoutColumn = files.filter((item) => item.reading?.result.sampleColumns?.length
    && !item.duplicate && item.columnIndex === null)
  const templateId = templates.length === 1 ? templates[0].id : null
  const canGenerate = Boolean(sample) && !saving && !stillReading && includedRows.length > 0
    && pendingRows.length === 0 && filesWithoutLab.length === 0 && filesWithoutColumn.length === 0

  const handleGenerate = async () => {
    if (!sample) return
    setSaving(true)
    setError(null)
    try {
      const outcome = await generateDraft({
        sampleId: sample.id,
        clientId: sample.client_id ?? null,
        templateId,
        files: usableFiles.map((item) => ({
          file: item.file,
          reading: item.reading as PdfReading,
          laboratoryId: item.laboratoryId,
          rows: rows.filter((row) => row.fileKey === item.key),
        })),
        onProgress: setProgress,
      })
      navigate(`/reportes/${outcome.reportId}`)
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'No se pudo generar el borrador.'} Lo que alcanzó a guardarse queda en Carga de resultados.`)
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  const visibleRows = showAll ? usableRows : doubtfulRows

  return (
    <div>
      <PageHeader
        title="Carga rápida"
        description="Suelta los PDF de los laboratorios de una muestra. El sistema reconoce el laboratorio, asigna cada parámetro por alias y te muestra solo lo dudoso."
      />
      {error && <ErrorState title="Revisa la carga" message={error} />}
      {progress && <p className="catalog-notice" role="status">{progress}</p>}
      {notice && <p className="catalog-notice" role="status">{notice}</p>}

      {loading ? <LoadingState message="Cargando muestras y catálogos…" /> : options && (
        <>
          <section className="result-selection">
            <label>
              Muestra
              <select
                value={sampleId}
                onChange={(event) => {
                  setSampleId(event.target.value)
                  setFiles([])
                  setRows([])
                }}
              >
                <option value="">Elige la muestra</option>
                {options.samples.map((item) => (
                  <option key={item.id} value={item.id}>{item.code} · {item.client_name}</option>
                ))}
              </select>
            </label>
          </section>

          {sample && (
            <div
              className={`quick-drop${dragging ? ' is-dragging' : ''}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <p>Arrastra aquí los PDF de AGQ, Chemilab o IHA (puedes soltar varios a la vez).</p>
              <label className="catalog-file-button">
                Elegir PDF
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf"
                  multiple
                  onChange={(event) => {
                    void addFiles(Array.from(event.target.files ?? []))
                    event.target.value = ''
                  }}
                />
              </label>
            </div>
          )}

          {files.length > 0 && (
            <section className="panel" aria-labelledby="quick-files-title">
              <h2 id="quick-files-title">Archivos</h2>
              <ul className="quick-files">
                {files.map((item) => {
                  const fileRows = rows.filter((row) => row.fileKey === item.key)
                  return (
                    <li key={item.key}>
                      <strong>{item.file.name}</strong>{' '}
                      {!item.reading && <StatusBadge label="Leyendo…" tone="info" />}
                      {item.reading && (
                        <>
                          {item.reading.adapterName
                            ? <StatusBadge label={`Formato ${item.reading.adapterName}`} tone="success" />
                            : <StatusBadge label="Formato no reconocido" tone="warning" />}
                          {item.duplicate && <StatusBadge label="Ya cargado para esta muestra" tone="neutral" />}
                          {!item.duplicate && item.reading.result.sampleColumns && (
                            <label>
                              Columna de {sample?.code}
                              <select
                                aria-label={`Columna de muestra en ${item.file.name}`}
                                value={item.columnIndex ?? ''}
                                onChange={(event) => changeColumn(item.key, event.target.value)}
                              >
                                <option value="">Elige la columna del informe</option>
                                {item.reading.result.sampleColumns.map((column, index) => (
                                  <option key={column.label} value={index}>{column.label}</option>
                                ))}
                              </select>
                            </label>
                          )}
                          {!item.duplicate && (item.reading.result.rows.length > 0 || item.reading.result.sampleColumns) && (
                            <label>
                              Laboratorio{item.labAutoDetected ? ' (detectado)' : ''}
                              <select
                                aria-label={`Laboratorio de ${item.file.name}`}
                                value={item.laboratoryId}
                                onChange={(event) => changeLaboratory(item.key, event.target.value)}
                              >
                                <option value="">Elige el laboratorio</option>
                                {options.laboratories.map((lab) => (
                                  <option key={lab.id} value={lab.id}>{lab.code} · {lab.name}</option>
                                ))}
                              </select>
                            </label>
                          )}
                          <span> {fileRows.length} fila(s), {fileRows.filter(isDoubtful).length} dudosa(s)</span>
                          {item.reading.result.requiresManualCapture && (
                            <p className="catalog-notice">
                              {item.reading.result.warnings?.[0] ?? 'Este PDF necesita captura manual.'}{' '}
                              <Link to={`/resultados/carga?muestra=${sampleId}`}>Ir a Carga de resultados</Link>
                            </p>
                          )}
                        </>
                      )}
                      <button type="button" onClick={() => removeFile(item.key)}>Quitar</button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {usableRows.length > 0 && (
            <section className="panel" aria-labelledby="quick-rows-title">
              <h2 id="quick-rows-title">
                {showAll ? 'Todas las filas' : `Filas dudosas (${doubtfulRows.length})`}
              </h2>
              <p>
                {safeRows.length} fila(s) coinciden exactamente con un alias del laboratorio, tienen resultado
                numérico y no traen observaciones.{' '}
                <button type="button" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? 'Ver solo las dudosas' : 'Ver también las seguras'}
                </button>
              </p>
              {visibleRows.length === 0 ? (
                <EmptyState title="No hay filas dudosas" description="Todas las filas se asignaron por alias y su resultado es claro." />
              ) : (
                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">Filas leídas de los PDF</caption>
                    <thead>
                      <tr>
                        <th scope="col">Parámetro del laboratorio</th>
                        <th scope="col">Resultado</th>
                        <th scope="col">Unidad</th>
                        <th scope="col">Dudas</th>
                        <th scope="col">Ensayo</th>
                        <th scope="col">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={row.key} className={row.excluded ? 'is-excluded' : undefined}>
                          <td>{row.externalParameter}{row.sourcePage ? <small> · pág. {row.sourcePage}</small> : null}</td>
                          <td>{row.externalResult}</td>
                          <td>{row.externalUnit || '—'}</td>
                          <td>
                            {row.doubts.length
                              ? row.doubts.map((doubt) => <div key={doubt}>{DOUBT_LABELS[doubt]}</div>)
                              : 'Ninguna'}
                            {row.notes.length > 0 && <small>{row.notes.join(' · ')}</small>}
                          </td>
                          <td>
                            <select
                              aria-label={`Ensayo para ${row.externalParameter}`}
                              disabled={row.excluded}
                              value={row.mappedTestId}
                              onChange={(event) => updateRow(row.key, {
                                mappedTestId: event.target.value,
                                mappedBy: event.target.value ? 'USER' : null,
                              })}
                            >
                              <option value="">Elige el ensayo</option>
                              {options.tests.map((test) => (
                                <option key={test.id} value={test.id}>{test.code} · {test.parameter_name ?? ''}</option>
                              ))}
                            </select>
                            {row.mappedBy === 'ALIAS' && <small> por alias: {testsById.get(row.mappedTestId)?.code}</small>}
                            {canLearnAlias(row) && (
                              <button type="button" onClick={() => void rememberAlias(row)}>
                                Recordar para la próxima vez
                              </button>
                            )}
                            {row.doubts.includes('QUALITATIVE') && !row.excluded && (
                              <label>
                                <input
                                  type="checkbox"
                                  checked={row.qualitativeConfirmed}
                                  onChange={(event) => updateRow(row.key, { qualitativeConfirmed: event.target.checked })}
                                />
                                Confirmo el texto «{row.externalResult}»
                              </label>
                            )}
                          </td>
                          <td>
                            <button type="button" onClick={() => updateRow(row.key, { excluded: !row.excluded })}>
                              {row.excluded ? 'Incluir' : 'Excluir'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {files.length > 0 && (
            <section className="panel" aria-labelledby="quick-generate-title">
              <h2 id="quick-generate-title">Generar borrador</h2>
              <p>
                Al generar el borrador se guarda cada PDF original sin modificar y quedan confirmadas las{' '}
                {includedRows.length} fila(s) incluidas, también las seguras. El borrador sigue pasando por
                revisión y aprobación.
              </p>
              {!templateId && (
                <p className="catalog-notice">
                  {templates.length === 0
                    ? 'No hay plantilla aprobada: el borrador quedará sin plantilla y deberás asignarla antes de emitir.'
                    : 'Hay varias plantillas aprobadas: elige la plantilla en el borrador.'}
                </p>
              )}
              {pendingRows.length > 0 && <p role="status">Faltan {pendingRows.length} fila(s) dudosa(s) por resolver (elige el ensayo, confirma el texto o exclúyela).</p>}
              {filesWithoutLab.length > 0 && <p role="status">Elige el laboratorio de {filesWithoutLab.length} PDF.</p>}
              {filesWithoutColumn.length > 0 && <p role="status">Elige la columna de la muestra en {filesWithoutColumn.length} informe(s) con varias muestras.</p>}
              <button type="button" disabled={!canGenerate} onClick={() => void handleGenerate()}>
                {saving ? 'Generando…' : 'Generar borrador'}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  )
}
