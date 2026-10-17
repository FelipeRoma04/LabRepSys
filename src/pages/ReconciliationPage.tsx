/**
 * Página de conciliación — /resultados/conciliacion
 * p08: comparación lado a lado, acciones con motivo obligatorio.
 */
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { StatusBadge } from '../components/StatusBadge'
import { Modal } from '../components/Modal'
import { listIssues, resolveIssue } from '../services/results'
import { formatDateTime } from '../lib/format'
import type { ReconciliationIssue } from '../types/results'

const ISSUE_TYPE_LABELS: Record<string, string> = {
  DATE_MISMATCH:          'Fecha distinta',
  MATRIX_MISMATCH:        'Matriz distinta',
  UNREQUESTED_PARAMETER:  'Parámetro no solicitado',
  MISSING_RESULT:         'Ensayo sin resultado',
  LCM_MISMATCH:           'LCM distinto',
  METHOD_MISMATCH:        'Método distinto',
  UNIT_MISMATCH:          'Unidad distinta',
  TECHNIQUE_MISMATCH:     'Técnica distinta',
  DUPLICATE_RESULT:       'Resultado duplicado',
  LAB_DEVIATION:          'Desviación del laboratorio',
  LEGACY_CODE_NO_MAPPING: 'Código heredado sin mapeo',
  INCOMPLETE_TEST_FIELDS: 'Ensayo con campos incompletos',
}

const columns: DataTableColumn<ReconciliationIssue>[] = [
  { key: 'issue_type', header: 'Tipo', render: (r) => ISSUE_TYPE_LABELS[r.issue_type] ?? r.issue_type },
  { key: 'source_a',   header: 'Fuente A',  render: (r) => r.source_a ?? '—' },
  { key: 'value_a',    header: 'Valor A',   render: (r) => r.value_a  ?? '—' },
  { key: 'source_b',   header: 'Fuente B',  render: (r) => r.source_b ?? '—' },
  { key: 'value_b',    header: 'Valor B',   render: (r) => r.value_b  ?? '—' },
  { key: 'status',     header: 'Estado',    render: (r) => (
    <StatusBadge
      tone={r.status === 'OPEN' ? 'warning' : 'success'}
      label={r.status === 'OPEN' ? 'Abierta' : 'Resuelta'}
    />
  )},
  { key: 'created_at', header: 'Fecha',     render: (r) => formatDateTime(r.created_at, {}, false) },
]

export function ReconciliationPage() {
  const [issues, setIssues]     = useState<ReconciliationIssue[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReconciliationIssue | null>(null)
  const [decision, setDecision] = useState<string>('ACCEPT_A')
  const [reason, setReason]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'OPEN' | 'RESOLVED'>('OPEN')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await listIssues()
      setIssues(data)
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Error al cargar.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filtered = issues.filter(
    (i) => statusFilter === 'all' || i.status === statusFilter,
  )

  const handleResolve = useCallback(async () => {
    if (!selected) return
    if (!reason.trim()) { setSaveError('El motivo es obligatorio.'); return }
    setSaving(true)
    setSaveError(null)
    try {
      await resolveIssue(selected.id, decision, reason)
      setSelected(null)
      setReason('')
      await load()
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Error al resolver.')
    } finally {
      setSaving(false)
    }
  }, [selected, decision, reason, load])

  return (
    <div>
      <PageHeader
        title="Conciliación de inconsistencias"
        description="Comparación lado a lado de datos de recepción vs fuente externa. El motivo es obligatorio en toda decisión."
      />

      {/* Filtros */}
      <div className="filter-bar">
        <label className="filter-field">
          <span>Estado</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">Todos</option>
            <option value="OPEN">Abiertas</option>
            <option value="RESOLVED">Resueltas</option>
          </select>
        </label>
      </div>

      {loading   && <LoadingState message="Cargando inconsistencias…" />}
      {loadError && <ErrorState title="Error" message={loadError} />}

      {!loading && !loadError && filtered.length === 0 && (
        <EmptyState
          title="Sin inconsistencias"
          description={statusFilter === 'OPEN' ? 'No hay inconsistencias abiertas.' : 'No hay registros en este estado.'}
        />
      )}

      {!loading && !loadError && filtered.length > 0 && (
        <DataTable
          caption="Inconsistencias de conciliación"
          columns={[
            ...columns,
            {
              key: 'actions',
              header: 'Acción',
              render: (r) =>
                r.status === 'OPEN' ? (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setSelected(r); setSaveError(null); setReason(''); setDecision('ACCEPT_A') }}
                    type="button"
                  >
                    Resolver
                  </button>
                ) : <span className="muted">—</span>,
            },
          ]}
          rows={filtered}
          rowKey={(r) => r.id}
        />
      )}

      {/* Modal de resolución */}
      {selected && (
        <Modal
          open
          title={`Resolver: ${ISSUE_TYPE_LABELS[selected.issue_type] ?? selected.issue_type}`}
          onClose={() => setSelected(null)}
        >
          <div className="reconciliation-modal">
            <div className="side-by-side">
              <div>
                <strong>{selected.source_a ?? 'Fuente A'}</strong>
                <p>{selected.value_a ?? '—'}</p>
              </div>
              <div>
                <strong>{selected.source_b ?? 'Fuente B'}</strong>
                <p>{selected.value_b ?? '—'}</p>
              </div>
            </div>

            {saveError && <ErrorState title="Error" message={saveError} />}

            <label>
              Decisión
              <select value={decision} onChange={(e) => setDecision(e.target.value)}>
                <option value="ACCEPT_A">Aceptar Fuente A</option>
                <option value="ACCEPT_B">Aceptar Fuente B</option>
                <option value="MANUAL">Corrección manual</option>
                <option value="REQUEST_REVIEW">Solicitar revisión</option>
              </select>
            </label>

            <label>
              Motivo *
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explique el motivo de la decisión…"
              />
            </label>

            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => void handleResolve()}
                disabled={saving || !reason.trim()}
                type="button"
              >
                {saving ? 'Guardando…' : 'Confirmar decisión'}
              </button>
              <button className="btn btn-secondary" onClick={() => setSelected(null)} type="button">
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
