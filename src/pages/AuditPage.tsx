import { useCallback, useEffect, useState } from 'react'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { formatDateTime } from '../lib/format'
import { supabase } from '../lib/supabase'

interface AuditRow {
  id: string
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_data: unknown
  new_data: unknown
  reason: string | null
  correlation_id: string | null
  created_at: string
}

const columns: DataTableColumn<AuditRow>[] = [
  { key: 'created_at', header: 'Fecha', render: (row) => formatDateTime(row.created_at) },
  { key: 'user_id', header: 'Usuario', render: (row) => row.user_id ?? 'Sistema' },
  { key: 'action', header: 'Acción', render: (row) => row.action },
  { key: 'entity_type', header: 'Entidad', render: (row) => row.entity_type },
  { key: 'entity_id', header: 'Identificador', render: (row) => row.entity_id ?? '—' },
  { key: 'reason', header: 'Motivo', render: (row) => row.reason ?? '—' },
  { key: 'correlation_id', header: 'Correlation ID', render: (row) => row.correlation_id ?? '—' },
]

export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [userId, setUserId] = useState('')
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    try {
      let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500)
      if (userId.trim()) query = query.eq('user_id', userId.trim())
      if (action.trim()) query = query.ilike('action', `%${action.trim()}%`)
      if (entity.trim()) query = query.ilike('entity_type', `%${entity.trim()}%`)
      if (from) query = query.gte('created_at', new Date(from).toISOString())
      if (to) query = query.lte('created_at', new Date(`${to}T23:59:59`).toISOString())
      const { data, error: queryError } = await query
      if (queryError) throw queryError
      setRows((data ?? []) as AuditRow[])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la auditoría.')
    } finally { setLoading(false) }
  }, [userId, action, entity, from, to])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return <div>
    <PageHeader title="Auditoría" description="Registro de solo lectura de acciones, entidades y motivos." />
    <div className="audit-filters">
      <label>Usuario<input onChange={(event) => setUserId(event.target.value)} placeholder="UUID" value={userId} /></label>
      <label>Acción<input onChange={(event) => setAction(event.target.value)} value={action} /></label>
      <label>Entidad<input onChange={(event) => setEntity(event.target.value)} value={entity} /></label>
      <label>Desde<input onChange={(event) => setFrom(event.target.value)} type="date" value={from} /></label>
      <label>Hasta<input onChange={(event) => setTo(event.target.value)} type="date" value={to} /></label>
      <button className="btn btn-secondary" onClick={() => void load()} type="button">Aplicar filtros</button>
    </div>
    {error && <ErrorState message={error} />}
    {loading ? <LoadingState message="Cargando auditoría…" /> : rows.length ? <DataTable
      caption="Eventos de auditoría"
      columns={[...columns, {
        key: 'details', header: 'Detalle', render: (row) => <details>
          <summary>Ver detalle</summary>
          <pre>{JSON.stringify({ anterior: row.old_data, nuevo: row.new_data }, null, 2)}</pre>
        </details>,
      }]}
      rows={rows}
      rowKey={(row) => row.id}
    /> : <EmptyState title="No hay eventos de auditoría" description="Ajusta los filtros o consulta otro periodo." />}
  </div>
}
