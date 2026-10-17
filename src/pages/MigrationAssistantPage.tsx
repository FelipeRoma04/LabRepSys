/**
 * Asistente de migración y calidad de datos — K05
 * Ruta: /administracion/migracion
 *
 * Req 1.1–3.2: mapeo de códigos heredados y calidad de datos.
 * Solo ADMIN y JEFE_TECNICA_CALIDAD confirman mapeos; AUDITOR solo lee.
 * El asistente NO corrige ni borra datos — solo propone y enlaza.
 */
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { useAuth } from '../hooks/useAuth'
import {
  listLegacyMappings,
  listUnmappedLegacyCodes,
  confirmLegacyMapping,
  listQualityClientIssues,
  listQualityTestIssues,
  getQualitySummary,
  rowsToCsv,
  type LegacyMapping,
  type QualityClientIssue,
  type QualityTestIssue,
  type QualitySummaryRow,
} from '../services/migrationAssistant'

type TabKey = 'mapeo' | 'calidad'
type CalidadTabKey = 'clientes' | 'ensayos'

// ─── Columnas ─────────────────────────────────────────────────────────────────

const mappingColumns: DataTableColumn<LegacyMapping>[] = [
  { key: 'legacy_source', header: 'Fuente', render: (r) => r.legacy_source },
  { key: 'legacy_code',   header: 'Código heredado', render: (r) => r.legacy_code },
  { key: 'status',        header: 'Estado', render: (r) => ({
    PROPOSED: 'Propuesta',
    CONFIRMED: 'Confirmado',
    REJECTED: 'Rechazado',
  }[r.status] ?? r.status) },
  { key: 'reason',     header: 'Motivo', render: (r) => r.reason ?? '—' },
  { key: 'decided_at', header: 'Decidido', render: (r) => r.decided_at
    ? new Date(r.decided_at).toLocaleDateString('es-CO') : '—' },
]

const clientColumns: DataTableColumn<QualityClientIssue>[] = [
  { key: 'business_name', header: 'Razón social', render: (r) => r.business_name },
  { key: 'nit',           header: 'NIT', render: (r) => r.nit ?? '—' },
  { key: 'issue_type',    header: 'Hallazgo', render: (r) => r.issue_type },
  { key: 'correction_path', header: 'Corregir en', render: (r) => (
    <a href={`#${r.correction_path}`} className="link">{r.correction_path}</a>
  ) },
]

const testColumns: DataTableColumn<QualityTestIssue>[] = [
  { key: 'code',           header: 'Código SA', render: (r) => r.code },
  { key: 'parameter_name', header: 'Parámetro', render: (r) => r.parameter_name ?? '—' },
  { key: 'missing_fields', header: 'Campos incompletos',
    render: (r) => r.missing_fields.join(', ') },
  { key: 'correction_path', header: 'Corregir en', render: (r) => (
    <a href={`#${r.correction_path}`} className="link">{r.correction_path}</a>
  ) },
]

// ─── Componente ───────────────────────────────────────────────────────────────

export function MigrationAssistantPage() {
  const { roles } = useAuth()
  const isAdmin = roles.some((r) => r.code === 'ADMIN')
  const isJTC   = roles.some((r) => r.code === 'JEFE_TECNICA_CALIDAD')
  const canDecide = isAdmin || isJTC

  const [tab, setTab] = useState<TabKey>('mapeo')
  const [calidad, setCalidad] = useState<CalidadTabKey>('clientes')

  // Mapeo
  const [mappings,       setMappings]       = useState<LegacyMapping[]>([])
  const [loadingMapeo,   setLoadingMapeo]   = useState(false)
  const [errorMapeo,     setErrorMapeo]     = useState<string | null>(null)

  // Modal confirmación
  const [selected,   setSelected]   = useState<LegacyMapping | null>(null)
  const [decision,   setDecision]   = useState<'CONFIRMED' | 'REJECTED' | null>(null)
  const [reason,     setReason]     = useState('')
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)

  // Calidad
  const [clientIssues,  setClientIssues]  = useState<QualityClientIssue[]>([])
  const [testIssues,    setTestIssues]    = useState<QualityTestIssue[]>([])
  const [summary,       setSummary]       = useState<QualitySummaryRow[]>([])
  const [loadingCal,    setLoadingCal]    = useState(false)
  const [errorCal,      setErrorCal]      = useState<string | null>(null)

  // ── Cargar mapeos ────────────────────────────────────────────────────────────
  const fetchMappings = useCallback(async () => {
    setLoadingMapeo(true)
    setErrorMapeo(null)
    try {
      const rows = await listLegacyMappings()
      setMappings(rows)
    } catch (e) {
      setErrorMapeo(e instanceof Error ? e.message : 'Error al cargar mapeos.')
    } finally {
      setLoadingMapeo(false)
    }
  }, [])

  // ── Cargar calidad ────────────────────────────────────────────────────────────
  const fetchCalidad = useCallback(async () => {
    setLoadingCal(true)
    setErrorCal(null)
    try {
      const [clients, tests, sum] = await Promise.all([
        listQualityClientIssues(),
        listQualityTestIssues(),
        getQualitySummary(),
      ])
      setClientIssues(clients)
      setTestIssues(tests)
      setSummary(sum)
    } catch (e) {
      setErrorCal(e instanceof Error ? e.message : 'Error al cargar datos de calidad.')
    } finally {
      setLoadingCal(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'mapeo') void fetchMappings()
    else void fetchCalidad()
  }, [tab, fetchMappings, fetchCalidad])

  // ── Confirmar / rechazar mapeo ────────────────────────────────────────────────
  const handleDecide = useCallback(async () => {
    if (!selected || !decision) return
    if (decision === 'REJECTED' && !reason.trim()) {
      setSaveError('El motivo es obligatorio para rechazar.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const result = await confirmLegacyMapping(selected.id, decision, reason || undefined)
      if (!result.ok) {
        setSaveError(result.message ?? 'No se pudo procesar el mapeo.')
        return
      }
      setSelected(null)
      setDecision(null)
      setReason('')
      void fetchMappings()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error al confirmar mapeo.')
    } finally {
      setSaving(false)
    }
  }, [selected, decision, reason, fetchMappings])

  // ── Exportar CSV ─────────────────────────────────────────────────────────────
  const exportClientsCsv = () => {
    const headers = ['Razón social', 'NIT', 'Hallazgo', 'Ruta de corrección']
    const rows = clientIssues.map((r) => [
      r.business_name, r.nit ?? '', r.issue_type, r.correction_path,
    ])
    const csv = rowsToCsv(headers, rows)
    downloadCsv(csv, 'calidad_clientes.csv')
  }

  const exportTestsCsv = () => {
    const headers = ['Código SA', 'Parámetro', 'Campos incompletos', 'Ruta de corrección']
    const rows = testIssues.map((r) => [
      r.code, r.parameter_name ?? '', r.missing_fields.join('; '), r.correction_path,
    ])
    const csv = rowsToCsv(headers, rows)
    downloadCsv(csv, 'calidad_ensayos.csv')
  }

  return (
    <div>
      <PageHeader
        title="Asistente de migración"
        description="Mapeo de códigos heredados y calidad de datos. Este asistente solo propone y enlaza — no corrige datos directamente."
      />

      {/* Indicadores de avance — Req 3.1 */}
      {summary.length > 0 && (
        <div className="quality-summary">
          {summary.map((s) => (
            <div key={s.category} className="quality-summary-card">
              <span className="quality-summary-count">{s.total_issues}</span>
              <span className="quality-summary-label">{
                {
                  clients:                  'Clientes con hallazgos',
                  tests:                    'Ensayos incompletos',
                  legacy_mappings_pending:  'Mapeos pendientes',
                }[s.category] ?? s.category
              }</span>
            </div>
          ))}
        </div>
      )}

      {/* Pestañas principales */}
      <div className="tabs" role="tablist">
        <button
          role="tab" aria-selected={tab === 'mapeo'}
          className={`tab${tab === 'mapeo' ? ' tab-active' : ''}`}
          onClick={() => setTab('mapeo')} type="button"
        >
          Mapeo de códigos heredados
        </button>
        <button
          role="tab" aria-selected={tab === 'calidad'}
          className={`tab${tab === 'calidad' ? ' tab-active' : ''}`}
          onClick={() => setTab('calidad')} type="button"
        >
          Calidad de datos
        </button>
      </div>

      {/* ── Pestaña: Mapeo ──────────────────────────────────────────────────── */}
      {tab === 'mapeo' && (
        <div>
          {loadingMapeo && <LoadingState message="Cargando mapeos…" />}
          {errorMapeo   && <ErrorState title="Error" message={errorMapeo} />}

          {!loadingMapeo && !errorMapeo && (
            mappings.length === 0
              ? <EmptyState
                  title="Sin mapeos registrados"
                  description="No hay mapeos de códigos heredados. Los mapeos se generan automáticamente al detectar alias sin correspondencia SA."
                />
              : <>
                  {canDecide && (
                    <p className="assistant-notice">
                      Selecciona una fila con estado «Propuesta» para confirmar o rechazar el mapeo.
                    </p>
                  )}
                  <DataTable
                    columns={[
                      ...mappingColumns,
                      ...(canDecide ? [{
                        key: 'actions',
                        header: 'Acción',
                        render: (r: LegacyMapping) =>
                          r.status === 'PROPOSED' ? (
                            <div className="row-actions">
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() => { setSelected(r); setDecision('CONFIRMED') }}
                                type="button"
                              >Confirmar</button>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => { setSelected(r); setDecision('REJECTED') }}
                                type="button"
                              >Rechazar</button>
                            </div>
                          ) : '—',
                      }] : []),
                    ]}
                    rows={mappings}
                    rowKey={(r) => r.id}
                    caption="Mapeos de códigos heredados"
                  />
                </>
          )}
        </div>
      )}

      {/* ── Pestaña: Calidad ─────────────────────────────────────────────────── */}
      {tab === 'calidad' && (
        <div>
          {loadingCal && <LoadingState message="Cargando datos de calidad…" />}
          {errorCal   && <ErrorState title="Error" message={errorCal} />}

          {!loadingCal && !errorCal && (
            <>
              <div className="tabs tabs-secondary" role="tablist">
                <button
                  role="tab" aria-selected={calidad === 'clientes'}
                  className={`tab${calidad === 'clientes' ? ' tab-active' : ''}`}
                  onClick={() => setCalidad('clientes')} type="button"
                >
                  Clientes ({clientIssues.length})
                </button>
                <button
                  role="tab" aria-selected={calidad === 'ensayos'}
                  className={`tab${calidad === 'ensayos' ? ' tab-active' : ''}`}
                  onClick={() => setCalidad('ensayos')} type="button"
                >
                  Ensayos ({testIssues.length})
                </button>
              </div>

              {calidad === 'clientes' && (
                <>
                  <div className="toolbar">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={exportClientsCsv}
                      type="button"
                      disabled={clientIssues.length === 0}
                    >Exportar CSV</button>
                  </div>
                  {clientIssues.length === 0
                    ? <EmptyState title="Sin hallazgos" description="No se detectaron problemas de calidad en clientes." />
                    : <DataTable columns={clientColumns} rows={clientIssues} rowKey={(r) => r.id} caption="Hallazgos en clientes" />
                  }
                </>
              )}

              {calidad === 'ensayos' && (
                <>
                  <div className="toolbar">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={exportTestsCsv}
                      type="button"
                      disabled={testIssues.length === 0}
                    >Exportar CSV</button>
                  </div>
                  {testIssues.length === 0
                    ? <EmptyState title="Sin hallazgos" description="No se detectaron ensayos con campos incompletos." />
                    : <DataTable columns={testColumns} rows={testIssues} rowKey={(r) => r.id} caption="Hallazgos en ensayos" />
                  }
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Modal de confirmación/rechazo ─────────────────────────────────────── */}
      {selected && decision && (
        <Modal
          title={decision === 'CONFIRMED' ? 'Confirmar mapeo' : 'Rechazar mapeo'}
          onClose={() => { setSelected(null); setDecision(null); setReason(''); setSaveError(null) }}
        >
          <p>
            <strong>Código heredado:</strong> {selected.legacy_code} ({selected.legacy_source})
          </p>

          {decision === 'REJECTED' && (
            <label className="modal-field">
              <span>Motivo del rechazo *</span>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describir por qué se rechaza este mapeo"
              />
            </label>
          )}

          {saveError && <p className="field-error" role="alert">{saveError}</p>}

          <div className="modal-actions">
            <button
              className={`btn ${decision === 'CONFIRMED' ? 'btn-success' : 'btn-danger'}`}
              onClick={() => void handleDecide()}
              disabled={saving}
              type="button"
            >
              {saving ? 'Procesando…' : decision === 'CONFIRMED' ? 'Confirmar' : 'Rechazar'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => { setSelected(null); setDecision(null); setReason(''); setSaveError(null) }}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
