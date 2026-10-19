import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../hooks/useAuth'
import { getValidationHistory, resolveValidationWarning, runValidations } from '../services/validations'
import type {
  ValidationEntityType,
  ValidationIssue,
  ValidationRun,
  ValidationSeverity,
} from '../types/validations'

const severityNames: Record<ValidationSeverity, string> = {
  ERROR: 'Error',
  WARNING: 'Advertencia',
  INFO: 'Información',
}

export function ValidationsPage() {
  const { roles } = useAuth()
  const canExecute = roles.some((role) =>
    ['ADMIN', 'ANALISTA', 'JEFE_TECNICA_CALIDAD'].includes(role.code),
  )
  const [runs, setRuns] = useState<ValidationRun[]>([])
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [entityType, setEntityType] = useState<ValidationEntityType>('SAMPLE')
  const [entityId, setEntityId] = useState('')
  const [severityFilter, setSeverityFilter] = useState<'all' | ValidationSeverity>('all')
  const [ruleFilter, setRuleFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('open')
  const [resolutions, setResolutions] = useState<Record<string, string>>({})

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const history = await getValidationHistory()
      setRuns(history.runs)
      setIssues(history.issues)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial de validaciones.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  const filteredIssues = useMemo(() => issues.filter((issue) => {
    const matchesSeverity = severityFilter === 'all' || issue.severity === severityFilter
    const matchesRule = !ruleFilter || issue.rule_code.toLocaleLowerCase().includes(ruleFilter.toLocaleLowerCase())
    const matchesEntity = !entityFilter || issue.run.entity_id.toLocaleLowerCase().includes(entityFilter.toLocaleLowerCase())
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'open' ? !issue.resolved : issue.resolved)
    return matchesSeverity && matchesRule && matchesEntity && matchesStatus
  }), [entityFilter, issues, ruleFilter, severityFilter, statusFilter])

  const execute = async (type: ValidationEntityType, id: string) => {
    if (!id.trim()) {
      setError('Indique el identificador de la entidad que se validará.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await runValidations(type, id.trim())
      setNotice('Validación ejecutada. El historial y los hallazgos se actualizaron.')
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo ejecutar la validación.')
    } finally {
      setSaving(false)
    }
  }

  const resolveWarning = async (issueId: string) => {
    const resolution = resolutions[issueId]?.trim() ?? ''
    if (!resolution) {
      setError('Escriba un comentario para resolver la advertencia.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await resolveValidationWarning(issueId, resolution)
      setResolutions((current) => ({ ...current, [issueId]: '' }))
      setNotice('La advertencia quedó resuelta y auditada.')
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo resolver la advertencia.')
    } finally {
      setSaving(false)
    }
  }

  const issueColumns: DataTableColumn<ValidationIssue>[] = [
    { key: 'severity', header: 'Severidad', render: (issue) => severityNames[issue.severity] },
    { key: 'rule', header: 'Regla', render: (issue) => `${issue.rule_code} · ${issue.rule?.description ?? ''}` },
    { key: 'entity', header: 'Entidad', render: (issue) => issue.run.entity_type },
    {
      key: 'entity_link',
      header: 'Registro',
      render: (issue) => issue.run.entity_type === 'SAMPLE'
        ? <Link to="/muestras/buscar">Abrir muestra · {issue.run.entity_id.slice(0, 8)}…</Link>
        : <Link to="/reportes/borradores">Abrir reporte · {issue.run.entity_id.slice(0, 8)}…</Link>,
    },
    { key: 'message', header: 'Hallazgo', render: (issue) => issue.message },
    { key: 'state', header: 'Estado', render: (issue) => issue.resolved ? 'Resuelto' : issue.blocking ? 'Bloqueante' : 'Pendiente de decisión' },
    {
      key: 'resolution',
      header: 'Decisión',
      render: (issue) => issue.resolved
        ? issue.resolution ?? '—'
        : issue.severity === 'WARNING' && !issue.blocking && canExecute
          ? <div className="validation-resolution">
              <textarea
                aria-label={`Comentario para ${issue.rule_code}`}
                onChange={(event) => setResolutions((current) => ({ ...current, [issue.id]: event.target.value }))}
                value={resolutions[issue.id] ?? ''}
              />
              <button
                className="btn btn-secondary"
                disabled={saving || !(resolutions[issue.id] ?? '').trim()}
                onClick={() => void resolveWarning(issue.id)}
                type="button"
              >Resolver</button>
            </div>
          : issue.blocking
            ? 'Corregir el dato y volver a ejecutar'
            : 'Requiere comentario',
    },
  ]

  const runColumns: DataTableColumn<ValidationRun>[] = [
    { key: 'date', header: 'Ejecución', render: (run) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(run.executed_at)) },
    { key: 'entity', header: 'Entidad', render: (run) => `${run.entity_type} · ${run.entity_id.slice(0, 8)}…` },
    { key: 'status', header: 'Estado', render: (run) => run.status },
    {
      key: 'rerun',
      header: 'Acción',
      render: (run) => canExecute
        ? <button
            className="btn btn-secondary"
            disabled={saving || run.status !== 'COMPLETED'}
            onClick={() => void execute(run.entity_type, run.entity_id)}
            type="button"
          >Reejecutar</button>
        : 'Solo lectura',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Motor de validaciones"
        description="Ejecuta reglas en la base de datos y consulta hallazgos e historial."
      />
      {error && <ErrorState title="No se pudo completar la operación" message={error} />}
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {canExecute && (
        <section className="validation-run-panel">
          <h2>Ejecutar validación</h2>
          <label>Tipo de entidad
            <select onChange={(event) => setEntityType(event.target.value as ValidationEntityType)} value={entityType}>
              <option value="SAMPLE">Muestra</option>
              <option value="REPORT">Reporte</option>
            </select>
          </label>
          <label>Identificador (UUID)
            <input onChange={(event) => setEntityId(event.target.value)} value={entityId} />
          </label>
          <button
            className="catalog-primary-button"
            disabled={saving || !entityId.trim()}
            onClick={() => void execute(entityType, entityId)}
            type="button"
          >{saving ? 'Procesando…' : 'Ejecutar validaciones'}</button>
        </section>
      )}
      <section className="validation-filter-panel">
        <h2>Hallazgos</h2>
        <label>Severidad
          <select onChange={(event) => setSeverityFilter(event.target.value as typeof severityFilter)} value={severityFilter}>
            <option value="all">Todas</option>
            <option value="ERROR">Error</option>
            <option value="WARNING">Advertencia</option>
            <option value="INFO">Información</option>
          </select>
        </label>
        <label>Regla
          <input onChange={(event) => setRuleFilter(event.target.value)} value={ruleFilter} />
        </label>
        <label>Entidad (UUID)
          <input onChange={(event) => setEntityFilter(event.target.value)} value={entityFilter} />
        </label>
        <label>Estado
          <select onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}>
            <option value="open">Pendiente</option>
            <option value="resolved">Resuelto</option>
            <option value="all">Todos</option>
          </select>
        </label>
      </section>
      {loading ? <LoadingState message="Cargando validaciones…" /> : filteredIssues.length
        ? <DataTable caption="Hallazgos de validación" columns={issueColumns} rows={filteredIssues} rowKey={(issue) => issue.id} />
        : <EmptyState title="Sin hallazgos" description="No hay hallazgos que coincidan con los filtros." />}
      <section className="validation-history-section">
        <h2>Historial de ejecuciones</h2>
        {loading ? <LoadingState message="Cargando historial…" /> : runs.length
          ? <DataTable caption="Historial de ejecuciones" columns={runColumns} rows={runs} rowKey={(run) => run.id} />
          : <EmptyState title="Sin ejecuciones" description="Ejecuta una validación para consultar su historial." />}
      </section>
    </div>
  )
}
