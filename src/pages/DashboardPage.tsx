import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { formatDateTime } from '../lib/format'
import { supabase } from '../lib/supabase'
import {
  listLateExternalReports,
  loadDeadlineIndicators,
  type DeadlineIndicators,
  type LateExternalReport,
} from '../services/dashboardIndicators'

interface RecentAudit {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  created_at: string
}

interface DashboardData {
  samples: number
  samplesPending: number
  reports: Record<string, number>
  execution: Record<string, number>
  pendingExternal: Record<string, number>
  recent: RecentAudit[]
}

const recentColumns: DataTableColumn<RecentAudit>[] = [
  { key: 'created_at', header: 'Fecha', render: (row) => formatDateTime(row.created_at) },
  { key: 'action', header: 'Acción', render: (row) => row.action },
  { key: 'entity_type', header: 'Entidad', render: (row) => row.entity_type },
  { key: 'entity_id', header: 'Identificador', render: (row) => row.entity_id?.slice(0, 8) ?? '—' },
]

function sinceDate(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

export function DashboardPage() {
  const [period, setPeriod] = useState(30)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deadlines, setDeadlines] = useState<DeadlineIndicators | null>(null)
  const [lateExternal, setLateExternal] = useState<LateExternalReport[] | null>(null)
  const [indicatorError, setIndicatorError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!supabase) {
      setError('La conexión con Supabase no está configurada.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const since = sinceDate(period)
      const { data: summary, error: summaryError } = await supabase.rpc('get_dashboard_summary', { p_since: since })
      if (summaryError) throw summaryError
      const result = summary as {
        samples_received: number
        samples_pending: number
        reports: Record<string, number>
        execution: Record<string, number>
        pending_external: Record<string, number>
        recent: RecentAudit[]
      }
      // Los indicadores operativos no bloquean el resumen si alguno falla
      const [deadlineResult, lateResult] = await Promise.allSettled([loadDeadlineIndicators(), listLateExternalReports()])
      setDeadlines(deadlineResult.status === 'fulfilled' ? deadlineResult.value : null)
      setLateExternal(lateResult.status === 'fulfilled' ? lateResult.value : null)
      const failed = [deadlineResult, lateResult].find((item) => item.status === 'rejected') as PromiseRejectedResult | undefined
      setIndicatorError(failed ? (failed.reason instanceof Error ? failed.reason.message : 'No se pudieron calcular algunos indicadores.') : null)
      setData({
        samples: result.samples_received ?? 0,
        samplesPending: result.samples_pending ?? 0,
        reports: result.reports ?? {},
        execution: result.execution ?? {},
        pendingExternal: result.pending_external ?? {},
        recent: result.recent ?? [],
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el tablero.')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  return (
    <div>
      <PageHeader title="Inicio" description="Indicadores basados en los datos del sistema." />
      <label className="dashboard-period">Periodo
        <select onChange={(event) => setPeriod(Number(event.target.value))} value={period}>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
          <option value={365}>Último año</option>
        </select>
      </label>
      {error && <ErrorState message={error} />}
      {loading ? <LoadingState message="Cargando indicadores…" /> : data && (
        <>
          <section aria-label="Indicadores operativos" className="dashboard-grid">
            <MetricCard label="Muestras recibidas" value={data.samples} to="/muestras/buscar" />
            <MetricCard label="Muestras pendientes de revisión" value={data.samplesPending} to="/muestras/buscar" />
            <MetricCard
              label="RSA pendientes de revisión"
              value={(data.reports.READY_FOR_REVIEW ?? 0) + (data.reports.IN_REVIEW ?? 0)}
              to="/reportes/revision"
            />
            {deadlines && (
              <>
                <MetricCard label="Entregas al cliente vencidas" value={deadlines.overdue} to="/muestras/buscar" tone={deadlines.overdue ? 'danger' : undefined} />
                <MetricCard
                  label={`Entregas próximas a vencer (≤ ${deadlines.alertBusinessDays} días hábiles)`}
                  value={deadlines.dueSoon}
                  to="/muestras/buscar"
                  tone={deadlines.dueSoon ? 'warning' : undefined}
                />
              </>
            )}
            {lateExternal && (
              <MetricCard
                label="Reportes externos retrasados"
                value={lateExternal.length}
                to="/laboratorios-externos"
                tone={lateExternal.length ? 'danger' : undefined}
              />
            )}
          </section>
          {deadlines?.issue && <p className="catalog-notice">{deadlines.issue}</p>}
          {indicatorError && <p className="catalog-notice">Algunos indicadores no están disponibles: {indicatorError}</p>}
          {lateExternal && lateExternal.length > 0 && (
            <section className="dashboard-section">
              <h2>Reportes externos más retrasados</h2>
              <ul className="dashboard-list">
                {lateExternal.slice(0, 5).map((item) => (
                  <li key={item.shipment_id}>
                    {item.sample_code} · {item.laboratory_name}
                    <strong>{item.days_overdue} día(s)</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-label="Resumen del periodo" className="dashboard-grid">
            {Object.entries(data.execution).map(([label, value]) => <MetricCard key={label} label={label.replaceAll('_', ' ')} value={value} />)}
            {Object.entries(data.reports).map(([label, value]) => <MetricCard key={label} label={`RSA ${label.toLocaleLowerCase()}`} value={value} />)}
          </section>
          <section className="dashboard-section">
            <h2>Reportes externos pendientes por laboratorio</h2>
            {Object.keys(data.pendingExternal).length ? <ul className="dashboard-list">
              {Object.entries(data.pendingExternal).map(([name, count]) => <li key={name}>{name}<strong>{count}</strong></li>)}
            </ul> : <EmptyState title="Sin reportes externos pendientes" />}
          </section>
          <section className="dashboard-section">
            <h2>Actividad reciente</h2>
            {data.recent.length ? <DataTable columns={recentColumns} rows={data.recent} rowKey={(row) => row.id} caption="Actividad de auditoría reciente" /> : <EmptyState title="Sin actividad en este periodo" />}
          </section>
        </>
      )}
    </div>
  )
}

function MetricCard({ label, value, to, tone }: {
  label: string
  value: number
  to?: string
  tone?: 'danger' | 'warning'
}) {
  return (
    <article className={`dashboard-card${tone ? ` dashboard-card--${tone}` : ''}`}>
      <h2>{label}</h2>
      <p>{value.toLocaleString('es-CO')}</p>
      {to && <Link to={to}>Ver detalle</Link>}
    </article>
  )
}
