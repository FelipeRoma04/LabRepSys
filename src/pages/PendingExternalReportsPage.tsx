import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import { listPendingExternalReports, receiveExternalReport } from '../services/externalShipments'
import type { ExternalShipmentStatus, PendingExternalReport } from '../types/externalShipments'

const labels: Record<ExternalShipmentStatus, string> = {
  PENDING_SEND: 'Pendiente de envío',
  SENT: 'Enviado',
  REPORT_RECEIVED: 'Reporte recibido',
  CANCELLED: 'Cancelado',
}

function displayDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('es-CO') : '—'
}

function currentLocalDateTime(): string {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

export function PendingExternalReportsPage() {
  const { roles } = useAuth()
  const canManage = roles.some((role) => ['ADMIN', 'RECEPCION', 'ANALISTA'].includes(role.code))
  const [rows, setRows] = useState<PendingExternalReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [laboratoryFilter, setLaboratoryFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [overdueFilter, setOverdueFilter] = useState<'all' | 'overdue' | 'not-overdue'>('all')
  const [receiving, setReceiving] = useState<PendingExternalReport | null>(null)
  const [receivedAt, setReceivedAt] = useState(currentLocalDateTime)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await listPendingExternalReports())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los reportes pendientes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const laboratories = useMemo(() => {
    const distinct = new Map(rows.map((row) => [row.laboratory_id, row.laboratory_name]))
    return [...distinct.entries()].sort((left, right) => left[1].localeCompare(right[1], 'es'))
  }, [rows])

  const filteredRows = useMemo(() => {
    const clientTerm = clientFilter.trim().toLocaleLowerCase()
    return rows.filter((row) => {
      if (laboratoryFilter && row.laboratory_id !== laboratoryFilter) return false
      if (clientTerm && !row.client_name.toLocaleLowerCase().includes(clientTerm)) return false
      if (overdueFilter === 'overdue' && !(row.days_overdue && row.days_overdue > 0)) return false
      if (overdueFilter === 'not-overdue' && (row.days_overdue ?? 0) > 0) return false
      return true
    })
  }, [clientFilter, laboratoryFilter, overdueFilter, rows])

  const groups = useMemo(() => {
    const grouped = new Map<string, PendingExternalReport[]>()
    filteredRows.forEach((row) => {
      const group = grouped.get(row.laboratory_id) ?? []
      group.push(row)
      grouped.set(row.laboratory_id, group)
    })
    return [...grouped.entries()].map(([id, reports]) => ({
      id,
      name: reports[0].laboratory_name,
      reports,
    }))
  }, [filteredRows])

  const startReceiving = (row: PendingExternalReport) => {
    setReceiving(row)
    setReceivedAt(currentLocalDateTime())
    setError(null)
  }

  const handleReceive = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!receiving || !receivedAt) return
    setSaving(true)
    setError(null)
    try {
      await receiveExternalReport(receiving.shipment_id, new Date(receivedAt).toISOString())
      setReceiving(null)
      setNotice(`Reporte de ${receiving.sample_code} recibido. El registro dejó de aparecer en pendientes.`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la recepción del reporte.')
    } finally {
      setSaving(false)
    }
  }

  const closeReceiveModal = useCallback(() => {
    if (!saving) setReceiving(null)
  }, [saving])

  const columns: DataTableColumn<PendingExternalReport>[] = [
    { key: 'client', header: 'Cliente', render: (row) => row.client_name },
    { key: 'sample', header: 'Muestra', render: (row) => row.sample_code },
    { key: 'point', header: 'Punto de muestreo', render: (row) => row.sampling_point ?? '—' },
    { key: 'expected', header: 'Fecha esperada', render: (row) => displayDate(row.expected_at) },
    {
      key: 'overdue',
      header: 'Días de retraso',
      render: (row) => row.days_overdue === null ? '—' : (
        <span className={row.days_overdue > 0 ? 'external-overdue' : ''}>
          {row.days_overdue > 0 ? `${row.days_overdue} días` : 'A tiempo'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => (
        <StatusBadge
          label={labels[row.status] ?? row.status}
          tone={row.days_overdue && row.days_overdue > 0 ? 'danger' : row.status === 'SENT' ? 'info' : 'warning'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) => canManage
        ? <button className="catalog-file-button" onClick={() => startReceiving(row)} type="button">Registrar recepción de reporte</button>
        : '—',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Reportes externos pendientes"
        description="Seguimiento de reportes por laboratorio. Los días de retraso se calculan con la fecha actual; las fechas esperadas son ingresadas manualmente."
      />
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {error && !receiving && <ErrorState message={error} />}
      <div className="catalog-toolbar">
        <label>
          Laboratorio
          <select value={laboratoryFilter} onChange={(event) => setLaboratoryFilter(event.target.value)}>
            <option value="">Todos</option>
            {laboratories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>
          Cliente
          <input value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} />
        </label>
        <label>
          Vencimiento
          <select value={overdueFilter} onChange={(event) => setOverdueFilter(event.target.value as typeof overdueFilter)}>
            <option value="all">Todos</option>
            <option value="overdue">Vencidos</option>
            <option value="not-overdue">No vencidos</option>
          </select>
        </label>
      </div>

      {loading ? <LoadingState message="Cargando reportes externos pendientes…" /> :
        groups.length === 0 ? (
          <EmptyState
            title={rows.length ? 'No hay reportes que coincidan con los filtros' : 'No hay reportes externos pendientes'}
            description={rows.length ? 'Ajusta los filtros para ver otros reportes.' : 'Los envíos pendientes de reporte aparecerán aquí.'}
          />
        ) : groups.map((group) => (
          <section className="external-pending-group" key={group.id} aria-label={`Pendientes de ${group.name}`}>
            <h2>{group.name}</h2>
            <DataTable
              caption={`Reportes pendientes de ${group.name}`}
              columns={columns}
              rowKey={(row) => row.shipment_id}
              rows={group.reports}
            />
          </section>
        ))}

      <Modal
        open={!!receiving}
        title={receiving ? `Registrar reporte recibido · ${receiving.sample_code}` : 'Registrar reporte recibido'}
        onClose={closeReceiveModal}
      >
        <form className="catalog-form" onSubmit={(event) => void handleReceive(event)}>
          {error && <ErrorState message={error} />}
          <p>La fecha real y el usuario autenticado quedarán registrados en el envío y en auditoría.</p>
          <label>
            Fecha y hora real de recepción
            <input required type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} />
          </label>
          <div className="catalog-form-actions">
            <button className="catalog-primary-button" disabled={saving} type="submit">
              {saving ? 'Registrando…' : 'Confirmar recepción'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
