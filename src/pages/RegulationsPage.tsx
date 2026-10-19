import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import {
  activateRegulationVersion,
  confirmSampleRegulations,
  getQuoteRegulationSuggestions,
  getRegulationCatalog,
  importRegulationCsv,
  listRegulationSamples,
  listSampleRegulations,
  parseRegulationCsv,
  regulationCsvTemplate,
} from '../services/regulations'
import type {
  QuoteRegulationSuggestion,
  RegulationActivity,
  RegulationCsvError,
  RegulationCsvRow,
  RegulationLimit,
  RegulationSample,
  RegulationVersion,
  SampleRegulation,
} from '../types/regulations'

const specialLabels: Record<NonNullable<RegulationLimit['special_value']>, string> = {
  N_A: 'N.A.',
  N_E: 'N.E.',
  N_R: 'N.R.',
  NOT_SPECIFIED: 'No especificado',
  ANALYSIS_AND_REPORT: 'Análisis y reporte',
  NONE: 'Ninguno',
}

function limitLabel(limit: RegulationLimit): string {
  if (limit.special_value) return specialLabels[limit.special_value]
  if (limit.limit_text) return limit.limit_text
  if (limit.limit_value === null) return 'Sin límite cargado'
  return `${limit.limit_operator ?? ''} ${new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 12,
    useGrouping: false,
  }).format(limit.limit_value)}`.trim()
}

function activityLabel(activity: RegulationActivity): string {
  return `Artículo ${activity.article} · ${activity.activity} · ${activity.discharge_type ?? 'Tipo pendiente'}`
}

function selectedMatchesSuggestions(
  selected: RegulationActivity[],
  suggestions: QuoteRegulationSuggestion[],
  regulationNameByVersion: Map<string, string>,
  versionById: Map<string, RegulationVersion>,
): boolean {
  if (selected.length !== suggestions.length) return false
  const unmatched = [...suggestions]
  return selected.every((activity) => {
    const version = versionById.get(activity.regulation_version_id)
    const name = version ? regulationNameByVersion.get(version.regulation_id) : undefined
    const index = unmatched.findIndex((suggestion) =>
      suggestion.regulation_name.trim().toLocaleLowerCase() === name?.trim().toLocaleLowerCase() &&
      (suggestion.article ?? '').trim().toLocaleLowerCase() === activity.article.trim().toLocaleLowerCase() &&
      (suggestion.activity ?? '').trim().toLocaleLowerCase() === activity.activity.trim().toLocaleLowerCase() &&
      suggestion.discharge_type === (activity.discharge_type ?? 'NA'),
    )
    if (index < 0) return false
    unmatched.splice(index, 1)
    return true
  })
}

function formatSuggestion(suggestion: QuoteRegulationSuggestion): string {
  return `${suggestion.regulation_name} · artículo ${suggestion.article ?? 'sin artículo'} · ${suggestion.activity ?? 'sin actividad'} · ${suggestion.discharge_type}`
}

export function RegulationsPage() {
  const { roles } = useAuth()
  const isAdmin = roles.some((role) => role.code === 'ADMIN')
  const canConfirm = isAdmin || roles.some((role) => role.code === 'ANALISTA')
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof getRegulationCatalog>> | null>(null)
  const [samples, setSamples] = useState<RegulationSample[]>([])
  const [sampleRegulations, setSampleRegulations] = useState<SampleRegulation[]>([])
  const [selectedSampleId, setSelectedSampleId] = useState('')
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([])
  const [decisionReason, setDecisionReason] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'DRAFT' | 'ACTIVE' | 'RETIRED'>('all')
  const [dischargeFilter, setDischargeFilter] = useState<'all' | 'ARD' | 'ARnD' | 'NA'>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [versionName, setVersionName] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [csvRows, setCsvRows] = useState<RegulationCsvRow[] | null>(null)
  const [csvErrors, setCsvErrors] = useState<RegulationCsvError[]>([])
  const [importCount, setImportCount] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [loadedCatalog, loadedSamples] = await Promise.all([
        getRegulationCatalog(),
        listRegulationSamples(),
      ])
      setCatalog(loadedCatalog)
      setSamples(loadedSamples)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la normativa.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  const selectedSample = samples.find((sample) => sample.id === selectedSampleId) ?? null
  const quoteSuggestions = useMemo(
    () => getQuoteRegulationSuggestions(selectedSample),
    [selectedSample],
  )
  const currentSelection = useMemo(
    () => (catalog?.activities ?? []).filter((activity) => selectedActivityIds.includes(activity.id)),
    [catalog?.activities, selectedActivityIds],
  )
  const activeVersions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return (catalog?.versions ?? []).filter((version) =>
      version.status === 'ACTIVE' &&
      (!version.valid_from || version.valid_from <= today) &&
      (!version.valid_until || version.valid_until >= today),
    )
  }, [catalog?.versions])
  const activeVersionById = useMemo(
    () => new Map(activeVersions.map((version) => [version.id, version])),
    [activeVersions],
  )
  const regulationNameByVersion = useMemo(
    () => new Map((catalog?.regulations ?? []).map((regulation) => [regulation.id, regulation.name])),
    [catalog?.regulations],
  )
  const activeActivities = useMemo(
    () => (catalog?.activities ?? []).filter((activity) => activeVersionById.has(activity.regulation_version_id)),
    [activeVersionById, catalog?.activities],
  )
  const quoteDiffers = quoteSuggestions.length > 0 && !selectedMatchesSuggestions(
    currentSelection,
    quoteSuggestions,
    regulationNameByVersion,
    activeVersionById,
  )
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleVersions = (catalog?.versions ?? []).filter((version) =>
    statusFilter === 'all' || version.status === statusFilter,
  )
  const visibleActivities = (catalog?.activities ?? []).filter((activity) => {
    const version = catalog?.versions.find((item) => item.id === activity.regulation_version_id)
    return (statusFilter === 'all' || version?.status === statusFilter) &&
      (dischargeFilter === 'all' || activity.discharge_type === dischargeFilter)
  })
  const filteredLimits = (catalog?.limits ?? []).filter((limit) => {
    const activity = catalog?.activities.find((item) => item.id === limit.activity_id)
    return activity !== undefined &&
      visibleActivities.some((item) => item.id === activity.id) &&
      `${limit.test?.code ?? ''} ${limit.test?.parameter_name ?? ''} ${limit.unit ?? ''} ${limitLabel(limit)}`
        .toLocaleLowerCase().includes(normalizedSearch)
  })

  const toggleActivity = (activityId: string, checked: boolean) => {
    setSelectedActivityIds((current) => checked
      ? current.includes(activityId) ? current : [...current, activityId]
      : current.filter((id) => id !== activityId))
  }

  const handleCsvFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setNotice(null)
    setCsvErrors([])
    setImportCount(null)
    try {
      setCsvRows(parseRegulationCsv(await file.text()))
    } catch (cause) {
      setCsvRows(null)
      setError(cause instanceof Error ? cause.message : 'No se pudo interpretar el CSV.')
    }
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([regulationCsvTemplate], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'plantilla-limites-resolucion-631.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (!csvRows?.length || !versionName.trim()) {
      setError('Indique el nombre de versión y seleccione un CSV con filas para importar.')
      return
    }
    setImporting(true)
    setError(null)
    try {
      const result = await importRegulationCsv(versionName, validFrom || null, validUntil || null, csvRows)
      setCsvErrors(result.errors)
      setImportCount(result.importedCount)
      setNotice(`Importación procesada: ${result.importedCount} fila(s) válida(s). La versión quedó en borrador.`)
      setCsvRows(null)
      setVersionName('')
      setValidFrom('')
      setValidUntil('')
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo importar la normativa.')
    } finally {
      setImporting(false)
    }
  }

  const handleActivate = async (version: RegulationVersion) => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await activateRegulationVersion(version.id)
      setNotice(`La versión "${version.version_name}" quedó activa.`)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo activar la versión.')
    } finally {
      setSaving(false)
    }
  }

  const selectSample = async (sampleId: string) => {
    setSelectedSampleId(sampleId)
    setSelectedActivityIds([])
    setSampleRegulations([])
    setDecisionReason('')
    setError(null)
    if (!sampleId) return
    try {
      const records = await listSampleRegulations(sampleId)
      setSampleRegulations(records)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las normativas confirmadas.')
    }
  }

  const handleConfirmSample = async () => {
    if (!selectedSampleId || !selectedActivityIds.length) {
      setError('Seleccione una muestra y al menos una actividad normativa.')
      return
    }
    if (quoteDiffers && !decisionReason.trim()) {
      setError('Indique el motivo de la diferencia frente a la cotización.')
      return
    }
    setConfirming(true)
    setError(null)
    setNotice(null)
    try {
      const result = await confirmSampleRegulations(selectedSampleId, selectedActivityIds, decisionReason)
      const records = await listSampleRegulations(selectedSampleId)
      setSampleRegulations(records)
      setSelectedActivityIds([])
      setDecisionReason('')
      setNotice(result.quoteDifference
        ? `Se confirmaron ${result.confirmedCount} columna(s). La diferencia con la cotización quedó registrada para conciliación.`
        : `Se confirmaron ${result.confirmedCount} columna(s) normativas.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo confirmar la normativa.')
    } finally {
      setConfirming(false)
    }
  }

  const columns: DataTableColumn<{
    version: RegulationVersion
    activity: RegulationActivity
    limit: RegulationLimit | null
  }>[] = [
    {
      key: 'regulation',
      header: 'Norma / versión',
      render: ({ version }) => `${regulationNameByVersion.get(version.regulation_id) ?? 'Norma'} · ${version.version_name}`,
    },
    { key: 'version_status', header: 'Estado', render: ({ version }) => <StatusBadge
      label={version.status === 'ACTIVE' ? 'Activa' : version.status === 'DRAFT' ? 'Borrador' : 'Retirada'}
      tone={version.status === 'ACTIVE' ? 'success' : version.status === 'DRAFT' ? 'warning' : 'neutral'}
    /> },
    { key: 'article', header: 'Artículo', render: ({ activity }) => activity.article },
    { key: 'activity', header: 'Actividad', render: ({ activity }) => activity.activity },
    { key: 'discharge', header: 'Tipo descarga', render: ({ activity }) => activity.discharge_type ?? 'Sin definir' },
    { key: 'test', header: 'Ensayo', render: ({ limit }) => limit?.test
      ? `${limit.test.code} · ${limit.test.parameter_name ?? ''}`
      : 'Sin ensayo asociado' },
    { key: 'limit', header: 'Límite', render: ({ limit }) => limit ? `${limitLabel(limit)} ${limit.unit ?? ''}`.trim() : 'Sin límite cargado' },
  ]

  const tableRows: {
    version: RegulationVersion
    activity: RegulationActivity
    limit: RegulationLimit | null
  }[] = []
  visibleVersions.forEach((version) => {
    visibleActivities
      .filter((activity) => activity.regulation_version_id === version.id)
      .forEach((activity) => {
        const activityLimits = filteredLimits.filter((limit) => limit.activity_id === activity.id)
        if (activityLimits.length) {
          activityLimits.forEach((limit) => tableRows.push({ version, activity, limit }))
        } else {
          tableRows.push({ version, activity, limit: null })
        }
      })
  })
  const matchingTableRows = tableRows.filter(({ version, activity, limit }) => {
    const values = [
      regulationNameByVersion.get(version.regulation_id),
      version.version_name,
      activity.article,
      activity.activity,
      activity.discharge_type,
      limit?.test?.code,
      limit?.test?.parameter_name,
      limit?.unit,
      limit ? limitLabel(limit) : null,
    ]
    return values.some((value) => value?.toLocaleLowerCase().includes(normalizedSearch))
  })
  const selectedSampleMatrix = selectedSample?.matrix
  const matrixText = `${selectedSampleMatrix?.code ?? ''} ${selectedSampleMatrix?.name ?? ''}`
  const inferredMatrixDischarge = /ARnD/i.test(matrixText)
    ? 'ARnD'
    : /\bARD\b/i.test(matrixText) ? 'ARD' : null
  const matrixMismatch = inferredMatrixDischarge !== null &&
    currentSelection.some((activity) => activity.discharge_type &&
      activity.discharge_type !== 'NA' &&
      activity.discharge_type !== inferredMatrixDischarge)

  return (
    <div>
      <PageHeader
        title="Normativa y límites"
        description="Consulta versiones y actividades. Los límites se muestran como referencia y no determinan conformidad."
        actions={isAdmin ? <button className="catalog-file-button" onClick={downloadTemplate} type="button">Descargar plantilla CSV</button> : undefined}
      />
      {error && <ErrorState title="No se pudo completar la operación" message={error} />}
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {loading ? <LoadingState message="Cargando catálogo normativo…" /> : (
        <>
          <section className="regulations-definition-panel">
            <h2>Pendiente de definición funcional</h2>
            <p>La aplicación no determina conformidad ni compara resultados contra límites. Siguen pendientes las decisiones DP-007, DP-008, DP-009 y DP-010: regla de decisión, incertidumbre, sumatorias BTEX/HAP y redondeo.</p>
          </section>

          {isAdmin && (
            <section className="regulations-import-panel">
              <h2>Importar versión desde CSV</h2>
              <p>El archivo se valida por fila. Toda versión importada queda como borrador hasta que ADMIN la active. Solo carga datos tomados de la fuente normativa oficial.</p>
              <div className="catalog-toolbar">
                <label>Nombre de versión
                  <input onChange={(event) => setVersionName(event.target.value)} value={versionName} />
                </label>
                <label>Vigente desde
                  <input onChange={(event) => setValidFrom(event.target.value)} type="date" value={validFrom} />
                </label>
                <label>Vigente hasta
                  <input onChange={(event) => setValidUntil(event.target.value)} type="date" value={validUntil} />
                </label>
                <label className="catalog-file-button">Seleccionar CSV
                  <input accept=".csv,text/csv" onChange={(event) => void handleCsvFile(event)} type="file" />
                </label>
                <button className="catalog-primary-button" disabled={importing || !csvRows?.length || !versionName.trim()} onClick={() => void handleImport()} type="button">
                  {importing ? 'Importando…' : 'Importar como borrador'}
                </button>
              </div>
              {csvRows && <p role="status">Vista previa: {csvRows.length} fila(s) lista(s) para validación del servidor.</p>}
              {importCount !== null && <p>Filas importadas: {importCount}. Los límites permanecen en borrador.</p>}
              {!!csvErrors.length && (
                <div className="regulations-import-errors" role="alert">
                  <h3>Filas con error</h3>
                  <ul>{csvErrors.map((item, index) => <li key={`${item.row}-${index}`}>Fila {item.row}: {item.message}</li>)}</ul>
                </div>
              )}
            </section>
          )}

          <section className="regulations-catalog-section">
            <h2>Versiones y actividades</h2>
            <div className="catalog-toolbar">
              <label>Buscar norma, actividad, ensayo o límite
                <input onChange={(event) => setSearch(event.target.value)} value={search} />
              </label>
              <label>Estado de versión
                <select onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}>
                  <option value="all">Todos</option>
                  <option value="DRAFT">Borrador</option>
                  <option value="ACTIVE">Activa</option>
                  <option value="RETIRED">Retirada</option>
                </select>
              </label>
              <label>Tipo de descarga
                <select onChange={(event) => setDischargeFilter(event.target.value as typeof dischargeFilter)} value={dischargeFilter}>
                  <option value="all">Todos</option>
                  <option value="ARD">ARD</option>
                  <option value="ARnD">ARnD</option>
                  <option value="NA">N/A</option>
                </select>
              </label>
            </div>
            {isAdmin && visibleVersions.some((version) => version.status === 'DRAFT') && (
              <div className="regulations-activate-list">
                {visibleVersions.filter((version) => version.status === 'DRAFT').map((version) => (
                  <button
                    className="catalog-file-button"
                    disabled={saving}
                    key={version.id}
                    onClick={() => void handleActivate(version)}
                    type="button"
                  >Activar “{version.version_name}”</button>
                ))}
              </div>
            )}
            {!matchingTableRows.length
              ? <EmptyState title="No hay actividades normativas" description="Ajusta los filtros o importa una versión con datos oficiales." />
              : <DataTable
                  caption="Límites normativos por ensayo"
                  columns={columns}
                  rows={matchingTableRows}
                  rowKey={({ version, activity, limit }) => `${version.id}-${activity.id}-${limit?.id ?? 'activity'}`}
                />}
          </section>

          <section className="regulations-sample-section">
            <h2>Confirmación de normativa por muestra</h2>
            <label>Muestra
              <select onChange={(event) => void selectSample(event.target.value)} value={selectedSampleId}>
                <option value="">Seleccione una muestra</option>
                {samples.map((sample) => <option key={sample.id} value={sample.id}>
                  {sample.code}{sample.quote?.code ? ` · Cotización ${sample.quote.code}` : ''}
                </option>)}
              </select>
            </label>
            {selectedSample && (
              <>
                <p>Matriz de recepción: {selectedSampleMatrix?.code ?? 'Sin código'} · {selectedSampleMatrix?.name ?? 'Sin matriz registrada'}</p>
                {quoteSuggestions.length > 0 ? (
                  <div className="regulations-suggestion-panel">
                    <strong>Sugerida desde cotización · requiere confirmación explícita</strong>
                    <ul>{quoteSuggestions.map((item, index) => <li key={`${item.regulation_name}-${index}`}>{formatSuggestion(item)}</li>)}</ul>
                  </div>
                ) : <p>No hay sugerencias normativas registradas en la cotización. La selección será manual.</p>}
                {matrixMismatch && (
                  <p className="regulations-warning" role="alert">
                    La matriz indicada en recepción menciona {inferredMatrixDischarge}, pero una o más actividades seleccionadas son de otro tipo de descarga. Verifique la fuente oficial antes de confirmar.
                  </p>
                )}
                {!canConfirm && <p>La confirmación requiere el rol ANALISTA o ADMIN; puede consultar las selecciones guardadas.</p>}
                {canConfirm && (
                  <>
                    <fieldset className="regulations-activity-picker">
                      <legend>Actividades vigentes que conformarán las columnas normativas</legend>
                      {activeActivities.length
                        ? activeActivities.map((activity) => {
                            const version = activeVersionById.get(activity.regulation_version_id)
                            const regulationName = version ? regulationNameByVersion.get(version.regulation_id) : ''
                            return (
                              <label key={activity.id}>
                                <input
                                  checked={selectedActivityIds.includes(activity.id)}
                                  onChange={(event) => toggleActivity(activity.id, event.target.checked)}
                                  type="checkbox"
                                />
                                {regulationName} · {version?.version_name} · {activityLabel(activity)}
                              </label>
                            )
                          })
                        : <p>No hay actividades de versiones activas vigentes para seleccionar.</p>}
                    </fieldset>
                    {quoteDiffers && (
                      <div className="regulations-warning" role="alert">
                        <strong>La selección difiere de la normativa acordada en la cotización.</strong>
                        <p>La cotización y la selección se conservarán como fuentes separadas y la diferencia quedará registrada en conciliación.</p>
                        <label>Motivo obligatorio
                          <textarea onChange={(event) => setDecisionReason(event.target.value)} rows={3} value={decisionReason} />
                        </label>
                      </div>
                    )}
                    <button
                      className="catalog-primary-button"
                      disabled={confirming || selectedActivityIds.length === 0 || (quoteDiffers && !decisionReason.trim())}
                      onClick={() => void handleConfirmSample()}
                      type="button"
                    >{confirming ? 'Confirmando…' : 'Confirmar normativa seleccionada'}</button>
                  </>
                )}
                <h3>Normativa confirmada / columnas del reporte</h3>
                {sampleRegulations.length
                  ? <ol>{sampleRegulations.map((item) => (
                      <li key={item.id}>
                        Columna {item.column_order} · {item.version?.regulation?.name ?? 'Norma'} · {item.version?.version_name ?? 'Versión'} · {item.activity ? activityLabel(item.activity) : 'Actividad no disponible'} · {item.source === 'QUOTE' ? 'Confirmada desde cotización' : 'Confirmada manualmente'}
                        {item.decision_reason ? ` · Motivo: ${item.decision_reason}` : ''}
                      </li>
                    ))}</ol>
                  : <p>Sin normativa confirmada. La muestra no debe avanzar a etapas que requieran selección normativa.</p>}
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
