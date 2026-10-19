/**
 * Lista de reportes RSA por estado — Borradores, En revisión, Aprobados, Emitidos
 * p11, p12
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { StatusBadge } from '../components/StatusBadge'
import { Modal } from '../components/Modal'
import { useAuth } from '../hooks/useAuth'
import { listReports, transitionReport, issueReport, rectifyReport } from '../services/reports'
import { formatDateTime } from '../lib/format'
import { REPORT_STATUS_LABELS } from '../types/reports'
import type { Report, ReportStatus } from '../types/reports'

interface Props {
  /** Filtro de estados a mostrar */
  statusFilter: ReportStatus[]
  title: string
  description: string
}

const statusTone = (s: ReportStatus) => {
  if (s === 'ISSUED')   return 'success' as const
  if (s === 'APPROVED') return 'success' as const
  if (s === 'RETURNED') return 'danger'  as const
  if (s === 'VOIDED')   return 'neutral' as const
  return 'warning' as const
}

export function ReportListPage({ statusFilter, title, description }: Props) {
  const { roles } = useAuth()
  const navigate   = useNavigate()

  const isAnalista = roles.some((r) => r.code === 'ANALISTA')
  const isJTC      = roles.some((r) => r.code === 'JEFE_TECNICA_CALIDAD')
  const isAdmin    = roles.some((r) => r.code === 'ADMIN')

  const [reports, setReports]   = useState<Report[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Modal rectificación
  const [rectifyTarget, setRectifyTarget] = useState<Report | null>(null)
  const [rectifyReason, setRectifyReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try { setReports(await listReports(statusFilter)) }
    catch (e: unknown) { setLoadError(e instanceof Error ? e.message : 'Error al cargar.') }
    finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const handleTransition = useCallback(async (report: Report, to: ReportStatus, comment?: string) => {
    setActionError(null)
    const res = await transitionReport(report.id, to, comment)
    if (!res.ok) { setActionError(res.message ?? 'No se pudo cambiar el estado.'); return }
    await load()
  }, [load])

  const handleIssue = useCallback(async (report: Report) => {
    setActionError(null)
    const res = await issueReport(report.id)
    if (!res.ok) { setActionError(res.message ?? 'No se pudo emitir.'); return }
    await load()
  }, [load])

  const handleRectify = useCallback(async () => {
    if (!rectifyTarget || !rectifyReason.trim()) return
    setSaving(true)
    const res = await rectifyReport(rectifyTarget.id, rectifyReason)
    setSaving(false)
    if (!res.ok) { setActionError(res.message ?? 'No se pudo rectificar.'); return }
    setRectifyTarget(null)
    setRectifyReason('')
    await load()
  }, [rectifyTarget, rectifyReason, load])

  const columns: DataTableColumn<Report>[] = [
    { key: 'code',       header: 'Código',  render: (r) => r.code ?? '—' },
    { key: 'version',    header: 'Ver.',    render: (r) => String(r.version) },
    { key: 'status',     header: 'Estado',  render: (r) => (
      <StatusBadge tone={statusTone(r.status)} label={REPORT_STATUS_LABELS[r.status]} />
    )},
    { key: 'updated_at', header: 'Última actualización', render: (r) => formatDateTime(r.updated_at) },
    { key: 'actions',    header: 'Acciones', render: (r) => (
      <div className="row-actions">
        <button className="btn btn-sm" onClick={() => navigate(`/reportes/${r.id}`)} type="button">Ver</button>

        {/* Enviar a revisión */}
        {r.status === 'READY_FOR_REVIEW' && isJTC && (
          <button className="btn btn-sm btn-secondary" onClick={() => void handleTransition(r, 'IN_REVIEW')} type="button">
            Iniciar revisión
          </button>
        )}

        {/* Aprobar */}
        {r.status === 'IN_REVIEW' && isJTC && (
          <button className="btn btn-sm btn-success" onClick={() => void handleTransition(r, 'APPROVED')} type="button">
            Aprobar
          </button>
        )}

        {/* Devolver */}
        {r.status === 'IN_REVIEW' && isJTC && (
          <button className="btn btn-sm btn-warning" onClick={() => void handleTransition(r, 'RETURNED', 'Devuelto para corrección')} type="button">
            Devolver
          </button>
        )}

        {/* Emitir */}
        {r.status === 'APPROVED' && isJTC && (
          <button className="btn btn-sm btn-primary" onClick={() => void handleIssue(r)} type="button">
            Emitir
          </button>
        )}

        {/* Rectificar */}
        {r.status === 'ISSUED' && (isJTC || isAdmin) && (
          <button className="btn btn-sm btn-warning" onClick={() => { setRectifyTarget(r); setRectifyReason('') }} type="button">
            Rectificar
          </button>
        )}

        {/* Vista imprimible */}
        {(r.status === 'ISSUED' || isAdmin || isAnalista) && (
          <button className="btn btn-sm" onClick={() => navigate(`/reportes/${r.id}/imprimir`)} type="button">
            Imprimir
          </button>
        )}
      </div>
    )},
  ]

  return (
    <div>
      <PageHeader title={title} description={description}>
        {isAnalista && (
          <button className="btn btn-primary" onClick={() => navigate('/reportes/nuevo')} type="button">
            Nuevo borrador
          </button>
        )}
      </PageHeader>

      {actionError && <ErrorState title="Error" message={actionError} />}
      {loading     && <LoadingState message="Cargando reportes…" />}
      {loadError   && <ErrorState title="Error al cargar" message={loadError} />}

      {!loading && !loadError && reports.length === 0 && (
        <EmptyState title="Sin reportes" description={`No hay reportes en estado: ${statusFilter.map((s) => REPORT_STATUS_LABELS[s]).join(', ')}.`} />
      )}

      {!loading && !loadError && reports.length > 0 && (
        <DataTable caption="Reportes" columns={columns} rows={reports} rowKey={(r) => r.id} />
      )}

      {/* Modal rectificación */}
      {rectifyTarget && (
        <Modal open title="Rectificar reporte emitido" onClose={() => setRectifyTarget(null)}>
          <p>El reporte emitido pasará a RECTIFICADO y se creará un nuevo borrador.</p>
          <label>
            Motivo de rectificación *
            <textarea
              rows={3}
              value={rectifyReason}
              onChange={(e) => setRectifyReason(e.target.value)}
              placeholder="Describa el motivo de la rectificación…"
            />
          </label>
          <div className="modal-actions">
            <button
              className="btn btn-primary"
              onClick={() => void handleRectify()}
              disabled={saving || !rectifyReason.trim()}
              type="button"
            >
              {saving ? 'Procesando…' : 'Confirmar rectificación'}
            </button>
            <button className="btn btn-secondary" onClick={() => setRectifyTarget(null)} type="button">
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
