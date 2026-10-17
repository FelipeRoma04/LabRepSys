/**
 * Pantalla /administracion/diagnostico — solo ADMIN y ADMIN_TECNICO.
 * K04 - Requisitos 3.1, 3.2, 3.4
 *
 * Muestra errores de cliente (últimos 7 días), intentos denegados
 * y conteos básicos. Permite filtrar por fecha, ruta y correlation_id.
 */
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { EmptyState } from '../components/EmptyState'
import { supabase } from '../lib/supabase'
import { formatDateTime } from '../lib/format'
import { useAuth } from '../hooks/useAuth'

interface ErrorLogRow {
  id: string
  user_id: string | null
  route: string
  message: string
  stack_hash: string | null
  correlation_id: string | null
  app_version: string | null
  created_at: string
}

interface DeniedAttemptRow {
  id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: unknown
  created_at: string
}

const errorColumns: DataTableColumn<ErrorLogRow>[] = [
  { key: 'created_at', header: 'Fecha', render: (r) => formatDateTime(r.created_at) },
  { key: 'route', header: 'Ruta', render: (r) => r.route },
  { key: 'message', header: 'Mensaje', render: (r) => r.message },
  { key: 'correlation_id', header: 'Referencia', render: (r) => r.correlation_id ?? '—' },
  { key: 'app_version', header: 'Versión', render: (r) => r.app_version ?? '—' },
]

const deniedColumns: DataTableColumn<DeniedAttemptRow>[] = [
  { key: 'created_at', header: 'Fecha', render: (r) => formatDateTime(r.created_at) },
  { key: 'action', header: 'Acción', render: (r) => r.action },
  { key: 'entity_type', header: 'Entidad', render: (r) => r.entity_type ?? '—' },
  { key: 'user_id', header: 'Usuario', render: (r) => r.user_id ? `${r.user_id.slice(0, 8)}…` : '—' },
]

type TabKey = 'errors' | 'denied'

export function DiagnosticsPage() {
  const { roles } = useAuth()
  const canReadDenied = roles.some((role) =>
    ['ADMIN', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'].includes(role.code),
  )
  const [tab, setTab] = useState<TabKey>('errors')

  // Filtros
  const [filterRoute, setFilterRoute] = useState('')
  const [filterCorrelation, setFilterCorrelation] = useState('')
  const [filterFrom, setFilterFrom] = useState('')

  // Datos
  const [errorLogs, setErrorLogs] = useState<ErrorLogRow[]>([])
  const [deniedAttempts, setDeniedAttempts] = useState<DeniedAttemptRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchErrors = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setLoadError(null)
    try {
      let q = supabase
        .from('client_error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (filterRoute.trim()) q = q.ilike('route', `%${filterRoute.trim()}%`)
      if (filterCorrelation.trim()) q = q.eq('correlation_id', filterCorrelation.trim())
      if (filterFrom.trim()) q = q.gte('created_at', new Date(filterFrom).toISOString())

      const { data, error } = await q
      if (error) throw error
      setErrorLogs((data ?? []) as ErrorLogRow[])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Error al cargar registros.')
    } finally {
      setLoading(false)
    }
  }, [filterRoute, filterCorrelation, filterFrom])

  const fetchDenied = useCallback(async () => {
    if (!supabase || !canReadDenied) return
    setLoading(true)
    setLoadError(null)
    try {
      const { data, error } = await supabase
        .from('v_denied_attempts')
        .select('*')
        .limit(200)
      if (error) throw error
      setDeniedAttempts((data ?? []) as DeniedAttemptRow[])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Error al cargar intentos denegados.')
    } finally {
      setLoading(false)
    }
  }, [canReadDenied])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (tab === 'errors') void fetchErrors()
      else if (canReadDenied) void fetchDenied()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [tab, fetchErrors, fetchDenied, canReadDenied])

  return (
    <div>
      <PageHeader
        title="Diagnóstico del sistema"
        description="Errores de cliente e intentos denegados de los últimos 7 días."
      />

      {/* Pestañas */}
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'errors'}
          className={`tab${tab === 'errors' ? ' tab-active' : ''}`}
          onClick={() => setTab('errors')}
          type="button"
        >
          Errores de cliente
        </button>
        {canReadDenied && (
          <button
            role="tab"
            aria-selected={tab === 'denied'}
            className={`tab${tab === 'denied' ? ' tab-active' : ''}`}
            onClick={() => setTab('denied')}
            type="button"
          >
            Intentos denegados
          </button>
        )}
      </div>

      {/* Filtros — solo en pestaña errores */}
      {tab === 'errors' && (
        <div className="filter-bar">
          <label className="filter-field">
            <span>Ruta</span>
            <input
              type="text"
              placeholder="/resultados/carga"
              value={filterRoute}
              onChange={(e) => setFilterRoute(e.target.value)}
            />
          </label>
          <label className="filter-field">
            <span>Referencia (correlation_id)</span>
            <input
              type="text"
              placeholder="cid-xxxxxxxx"
              value={filterCorrelation}
              onChange={(e) => setFilterCorrelation(e.target.value)}
            />
          </label>
          <label className="filter-field">
            <span>Desde</span>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </label>
          <button
            className="btn btn-secondary"
            onClick={() => void fetchErrors()}
            type="button"
          >
            Buscar
          </button>
        </div>
      )}

      {loading && <LoadingState message="Cargando registros…" />}
      {loadError && <ErrorState title="Error al cargar" message={loadError} />}

      {!loading && !loadError && tab === 'errors' && (
        errorLogs.length === 0
          ? <EmptyState title="Sin errores registrados" description="No hay errores de cliente en el período." />
          : <DataTable
              columns={errorColumns}
              rows={errorLogs}
              rowKey={(r) => r.id}
              caption="Errores de cliente"
            />
      )}

      {!loading && !loadError && tab === 'denied' && (
        deniedAttempts.length === 0
          ? <EmptyState title="Sin intentos denegados" description="No hay intentos denegados en los últimos 7 días." />
          : <DataTable
              columns={deniedColumns}
              rows={deniedAttempts}
              rowKey={(r) => r.id}
              caption="Intentos denegados"
            />
      )}
    </div>
  )
}
