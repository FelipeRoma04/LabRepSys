import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import { listClients } from '../services/commercial'
import {
  getSampleOptions,
  importSampleRows,
  listSamples,
  previewSamplesCsv,
  type CsvSamplePreviewRow,
} from '../services/samples'
import type { Client } from '../types/commercial'
import type { Sample } from '../types/samples'

type FilterValues = {
  search: string
  status: string
  from: string
  until: string
}

interface SuggestedRegulation {
  regulation_name?: string
  article?: string
  discharge_type?: string
  requires_confirmation?: boolean
}

function getSuggestedRegulations(value: unknown): SuggestedRegulation[] {
  if (typeof value !== 'object' || value === null || !('regulations' in value)) return []
  const regulations = value.regulations
  if (!Array.isArray(regulations)) return []
  return regulations.filter((item): item is SuggestedRegulation =>
    typeof item === 'object' && item !== null,
  )
}

function localDate(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

export function SamplesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { roles } = useAuth()
  const canManage = roles.some((role) => ['ADMIN', 'RECEPCION'].includes(role.code))
  const [samples, setSamples] = useState<Sample[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [filters, setFilters] = useState<FilterValues>({
    search: '',
    status: '',
    from: '',
    until: '',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(
    typeof location.state === 'object' && location.state !== null &&
      'notice' in location.state && typeof location.state.notice === 'string'
      ? location.state.notice
      : null,
  )
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null)
  const [importRows, setImportRows] = useState<CsvSamplePreviewRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sampleRows, clientRows] = await Promise.all([listSamples(), listClients()])
      setSamples(sampleRows)
      setClients(clientRows)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las muestras.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  const filtered = useMemo(() => {
    const term = filters.search.trim().toLocaleLowerCase()
    return samples.filter((sample) => {
      if (filters.status && sample.status !== filters.status) return false
      const receivedDate = localDate(sample.received_at)
      if (filters.from && receivedDate < filters.from) return false
      if (filters.until && receivedDate > filters.until) return false
      if (!term) return true
      return [
        sample.code,
        sample.client?.business_name,
        sample.client?.nit,
        sample.quote?.code,
        sample.plan_code,
        sample.sampling_point,
        sample.sampled_at ? localDate(sample.sampled_at) : null,
        localDate(sample.received_at),
        sample.status,
      ].some((value) => value?.toLocaleLowerCase().includes(term))
    })
  }, [filters, samples])

  const openImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setImportErrors([])
    try {
      const [options, clientRows, text] = await Promise.all([
        getSampleOptions(),
        listClients(),
        file.text(),
      ])
      const preview = await previewSamplesCsv(
        text,
        clientRows.filter((client) => client.active),
        options.matrices,
        options.codePattern,
      )
      const withDuplicateErrors = preview.map((row) => {
        const duplicate = samples.some((sample) => sample.code === row.input.code)
        return duplicate
          ? {
              ...row,
              issues: [...row.issues, {
                row: row.input.row,
                message: 'El código ya existe en el sistema.',
                severity: 'error' as const,
              }],
            }
          : row
      })
      setImportRows(withDuplicateErrors)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo leer el archivo CSV.')
    }
  }

  const confirmImport = async () => {
    if (!importRows) return
    const validRows = importRows.filter((row) =>
      row.client_id && row.matrix_id &&
      !row.issues.some((issue) => issue.severity === 'error'),
    )
    if (!validRows.length) {
      setImportErrors([{ row: 0, message: 'No hay filas válidas para importar.' }])
      return
    }
    setImporting(true)
    setImportErrors([])
    try {
      const result = await importSampleRows(validRows.map((row) => row.input))
      setImportErrors(result.errors.map((item) => ({ row: item.row, message: item.message })))
      setNotice(`Importación terminada: ${result.imported_count} muestra(s) importada(s). Las filas importadas quedan pendientes de revisión.`)
      if (!result.errors.length && validRows.length === importRows.length) setImportRows(null)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo importar el CSV.')
    } finally {
      setImporting(false)
    }
  }

  const clientName = (sample: Sample) =>
    sample.client?.business_name ??
    clients.find((client) => client.id === sample.client_id)?.business_name ??
    '—'

  const columns: DataTableColumn<Sample>[] = [
    { key: 'code', header: 'Código', render: (sample) => sample.code },
    { key: 'client', header: 'Cliente', render: (sample) => clientName(sample) },
    { key: 'nit', header: 'NIT', render: (sample) => sample.client?.nit ?? clients.find((client) => client.id === sample.client_id)?.nit ?? '—' },
    { key: 'quote', header: 'Cotización', render: (sample) => sample.quote?.code ?? '—' },
    { key: 'plan', header: 'Plan', render: (sample) => sample.plan_code ?? '—' },
    { key: 'point', header: 'Punto', render: (sample) => sample.sampling_point ?? '—' },
    { key: 'received', header: 'Recibida', render: (sample) => new Date(sample.received_at).toLocaleString('es-CO') },
    {
      key: 'status',
      header: 'Estado',
      render: (sample) => (
        <StatusBadge
          label={sample.status === 'PENDING_REVIEW' ? 'Pendiente de revisión' : sample.status}
          tone={sample.status === 'PENDING_REVIEW' ? 'warning' : 'success'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (sample) => (
        <div className="catalog-row-actions">
          <button onClick={() => setSelectedSample(sample)} type="button">Detalle</button>
          {canManage && <button onClick={() => navigate(`/muestras/recepcion?edit=${encodeURIComponent(sample.id)}`)} type="button">Editar</button>}
        </div>
      ),
    },
  ]

  const statuses = Array.from(new Set(samples.map((sample) => sample.status)))
  const suggestedRegulations = getSuggestedRegulations(
    selectedSample?.reception?.request_review.quote_suggestions,
  )

  return (
    <>
      <PageHeader
        title="Muestras"
        description="Búsqueda y seguimiento de muestras recibidas."
        actions={(
          <div className="catalog-header-actions">
            {canManage && <button className="catalog-primary-button" onClick={() => navigate('/muestras/recepcion')} type="button">Nueva recepción</button>}
            {canManage && <label className="catalog-file-button">Importar CSV<input accept=".csv,text/csv" onChange={(event) => void openImport(event)} ref={fileInput} type="file" /></label>}
          </div>
        )}
      />
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {error && <ErrorState message={error} />}
      <div className="catalog-toolbar sample-search-toolbar">
        <label>Buscar código, cliente, NIT, cotización, plan o punto
          <input onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} value={filters.search} />
        </label>
        <label>Estado
          <select onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} value={filters.status}>
            <option value="">Todos</option>
            {statuses.map((status) => <option key={status} value={status}>{status === 'PENDING_REVIEW' ? 'Pendiente de revisión' : status}</option>)}
          </select>
        </label>
        <label>Recibida desde<input onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} type="date" value={filters.from} /></label>
        <label>Recibida hasta<input onChange={(event) => setFilters((current) => ({ ...current, until: event.target.value }))} type="date" value={filters.until} /></label>
      </div>
      {loading ? <LoadingState message="Cargando muestras…" /> :
        filtered.length
          ? <DataTable caption="Muestras" columns={columns} rowKey={(sample) => sample.id} rows={filtered} />
          : <EmptyState title="No hay muestras para mostrar" description="Crea una recepción o ajusta los filtros de búsqueda." />}

      <Modal open={!!selectedSample} onClose={() => setSelectedSample(null)} title={selectedSample ? `Muestra ${selectedSample.code}` : 'Detalle de muestra'}>
        {selectedSample && <div className="catalog-form">
          <dl className="catalog-detail">
            <div><dt>Cliente</dt><dd>{clientName(selectedSample)}{selectedSample.client?.nit ? ` · NIT ${selectedSample.client.nit}` : ''}</dd></div>
            <div><dt>Cotización</dt><dd>{selectedSample.quote?.code ?? '—'}</dd></div>
            <div><dt>Matriz</dt><dd>{selectedSample.matrix ? `${selectedSample.matrix.code} · ${selectedSample.matrix.name}` : '—'}</dd></div>
            <div><dt>Plan</dt><dd>{selectedSample.plan_code ?? '—'}</dd></div>
            <div><dt>Punto de muestreo</dt><dd>{selectedSample.sampling_point ?? '—'}</dd></div>
            <div><dt>Fecha de muestreo</dt><dd>{selectedSample.sampled_at ? new Date(selectedSample.sampled_at).toLocaleString('es-CO') : '—'}</dd></div>
            <div><dt>Fecha de recepción</dt><dd>{new Date(selectedSample.received_at).toLocaleString('es-CO')}</dd></div>
            <div><dt>Estado</dt><dd>{selectedSample.status}</dd></div>
            <div><dt>Condiciones de llegada</dt><dd>{selectedSample.reception?.arrival_conditions ?? '—'}</dd></div>
            <div><dt>Desviaciones</dt><dd>{selectedSample.reception?.deviations ?? '—'}</dd></div>
            <div><dt>Consulta al cliente</dt><dd>{selectedSample.reception?.client_consulted_on_deviation ? 'Registrada' : 'No registrada'}</dd></div>
            <div><dt>Cadena de custodia verificada</dt><dd>{selectedSample.reception?.chain_of_custody_verified ? 'Sí' : 'No'}</dd></div>
          </dl>
          <h3>Recipientes y preservación</h3>
          <pre className="sample-json">{JSON.stringify({ containers: selectedSample.reception?.containers ?? [], preservation: selectedSample.reception?.preservation ?? {} }, null, 2)}</pre>
          <h3>Ensayos y laboratorios</h3>
          {selectedSample.tests?.length
            ? <ul>{selectedSample.tests.map((test) => <li key={test.id}>{test.test?.code ?? test.test_id} · {test.test?.parameter_name ?? ''} · {test.execution_type === 'SUBCONTRACTED' ? 'Subcontratado' : 'SA'} · {test.laboratory?.name ?? 'Laboratorio sin asignar'}</li>)}</ul>
            : <p>No hay ensayos vinculados.</p>}
          <h3>Normativa sugerida</h3>
          {suggestedRegulations.length
            ? <ul>{suggestedRegulations.map((regulation, index) => (
                <li key={`${regulation.regulation_name ?? 'norma'}-${index}`}>
                  {regulation.regulation_name ?? 'Norma'} · {regulation.article ?? 'sin artículo'} · {regulation.discharge_type ?? 'sin tipo'} · {regulation.requires_confirmation ? 'Pendiente de confirmación' : 'Confirmada'}
                </li>
              ))}</ul>
            : <p>No hay normativa sugerida desde cotización.</p>}
          <h3>Historial</h3>
          {selectedSample.events?.length
            ? <ul>{selectedSample.events.map((event) => <li key={event.id}>{new Date(event.created_at).toLocaleString('es-CO')} · {event.event_type}</li>)}</ul>
            : <p>No hay eventos registrados.</p>}
          <section className="sample-pending-section">
            <h3>Datos de campo</h3>
            <p>Consulta o registra coordenadas y mediciones asociadas a esta muestra.</p>
            <button
              onClick={() => navigate(`/muestras/datos-de-campo?sample_id=${encodeURIComponent(selectedSample.id)}`)}
              type="button"
            >Abrir datos de campo</button>
          </section>
          <section className="sample-pending-section">
            <h3>Adjuntos</h3>
            <p>Los archivos asociados se gestionan en la pantalla de datos de campo.</p>
            <button
              onClick={() => navigate(`/muestras/datos-de-campo?sample_id=${encodeURIComponent(selectedSample.id)}`)}
              type="button"
            >Ver adjuntos</button>
          </section>
        </div>}
      </Modal>

      <Modal open={!!importRows} onClose={() => !importing && setImportRows(null)} title="Importar muestras desde CSV">
        {importRows && <div className="catalog-form">
          <p>Vista previa. No se ejecutan enlaces ni contenido externo. Las filas con errores no se importan; advertencias de fecha requieren revisión.</p>
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Fila</th><th>Código</th><th>Cliente</th><th>Matriz</th><th>Fecha de muestreo</th><th>Resultado de validación</th></tr></thead>
              <tbody>{importRows.map((row) => (
                <tr key={row.input.row}>
                  <td>{row.input.row}</td><td>{row.input.code}</td>
                  <td>{clients.find((client) => client.id === row.client_id)?.business_name ?? (row.input.client_nit || row.input.client_name)}</td>
                  <td>{row.input.matrix_code || row.input.matrix_name}</td><td>{row.input.sampled_at || '—'}</td>
                  <td>{row.issues.length ? row.issues.map((issue) => `${issue.severity === 'error' ? 'Error' : 'Advertencia'}: ${issue.message}`).join(' · ') : 'Lista'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {importErrors.length > 0 && <ul className="catalog-import-errors">{importErrors.map((item, index) => <li key={`${item.row}-${index}`}>Fila {item.row}: {item.message}</li>)}</ul>}
          <div className="catalog-form-actions">
            <button disabled={importing} onClick={() => setImportRows(null)} type="button">Cerrar</button>
            <button className="catalog-primary-button" disabled={importing || importRows.every((row) => row.issues.some((issue) => issue.severity === 'error'))} onClick={() => void confirmImport()} type="button">
              {importing ? 'Importando…' : 'Importar filas válidas'}
            </button>
          </div>
        </div>}
      </Modal>
    </>
  )
}
