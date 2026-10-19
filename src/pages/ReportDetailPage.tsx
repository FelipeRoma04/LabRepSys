import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import { formatDateTime } from '../lib/format'
import { getReport, transitionReport } from '../services/reports'
import {
  addReportComment,
  getReportComposition,
  getReportHistory,
  isCurrentApprovalDeputy,
} from '../services/reportBuilder'
import type { Report } from '../types/reports'

type CommentScope = 'REPORT' | 'RESULT' | 'FIELD'

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Borrador',
    VALIDATING: 'Validando',
    READY_FOR_REVIEW: 'Listo para revisión',
    IN_REVIEW: 'En revisión',
    RETURNED: 'Devuelto',
    APPROVED: 'Aprobado',
    ISSUED: 'Emitido',
    RECTIFIED: 'Rectificado',
    VOIDED: 'Anulado',
  }
  return labels[status] ?? status
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'APPROVED' || status === 'ISSUED') return 'success'
  if (status === 'RETURNED') return 'danger'
  if (status === 'VOIDED' || status === 'RECTIFIED') return 'neutral'
  return 'warning'
}

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, roles } = useAuth()
  const isAnalyst = roles.some((role) => role.code === 'ANALISTA')
  const isReviewer = roles.some((role) =>
    role.code === 'JEFE_TECNICA_CALIDAD',
  )
  const [report, setReport] = useState<Report | null>(null)
  const [composition, setComposition] = useState<Awaited<ReturnType<typeof getReportComposition>> | null>(null)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getReportHistory>>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [commentScope, setCommentScope] = useState<CommentScope>('REPORT')
  const [commentResultId, setCommentResultId] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [isDeputy, setIsDeputy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [reportRow, reportComposition, reportHistory, currentDeputy] = await Promise.all([
        getReport(id),
        getReportComposition(id),
        getReportHistory(id),
        profile?.id ? isCurrentApprovalDeputy(profile.id) : Promise.resolve(false),
      ])
      setReport(reportRow)
      setComposition(reportComposition)
      setHistory(reportHistory)
      setIsDeputy(currentDeputy)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el reporte.')
    } finally {
      setLoading(false)
    }
  }, [id, profile])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const act = async (toStatus: string) => {
    if (!report) return
    setSaving(true)
    setError(null)
    try {
      const result = await transitionReport(report.id, toStatus as Report['status'], reviewComment || undefined)
      if (!result.ok) throw new Error(result.message ?? 'No se pudo cambiar el estado.')
      setReviewComment('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado.')
    } finally {
      setSaving(false)
    }
  }

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!id || !profile || !comment.trim()) return
    setSaving(true)
    setError(null)
    try {
      await addReportComment({
        reportId: id,
        entityType: commentScope,
        entityId: commentScope === 'RESULT' ? commentResultId || null : null,
        comment,
        createdBy: profile.id,
      })
      setComment('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el comentario.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState message="Cargando reporte…" />
  if (error && !report) return <ErrorState title="Error al cargar" message={error} />
  if (!report || !composition) return <EmptyState title="Reporte no encontrado" description="No se encontró el reporte o no tiene permiso para consultarlo." />

  const canEdit = isAnalyst && report.prepared_by === profile?.id && ['DRAFT', 'RETURNED'].includes(report.status)
  const issues = (composition.validationRun?.issues ?? []) as Array<{
    id: string
    rule_code: string
    severity: string
    field_name: string | null
    message: string
    blocking: boolean
    resolved: boolean
  }>

  return (
    <div>
      <PageHeader
        title={report.code ?? `Borrador RSA · ${report.id.slice(0, 8)}`}
        description="Detalle, historial, hallazgos de validación y comentarios del reporte."
      >
        <StatusBadge label={statusLabel(report.status)} tone={statusTone(report.status)} />
      </PageHeader>
      {error && <ErrorState title="No se pudo completar la acción" message={error} />}

      <section className="panel">
        <h2>Resumen</h2>
        <dl className="detail-grid">
          <div><dt>Versión</dt><dd>{report.version}</dd></div>
          <div><dt>Cliente</dt><dd>{report.client_id ?? 'No asignado'}</dd></div>
          <div><dt>Contacto</dt><dd>{report.contact_id ?? 'No asignado'}</dd></div>
          <div><dt>Preparado por</dt><dd>{report.prepared_by}</dd></div>
          <div><dt>Revisado por</dt><dd>{report.reviewed_by ?? 'Pendiente'}</dd></div>
          <div><dt>Aprobado por</dt><dd>{report.approved_by ?? 'Pendiente'}</dd></div>
        </dl>
        {canEdit && (
          <Link className="btn btn-secondary" to={`/reportes/${report.id}/editar`}>Editar borrador</Link>
        )}
      </section>

      {report.status === 'DRAFT' && canEdit && (
        <div className="row-actions">
          <button className="btn btn-primary" disabled={saving} onClick={() => void act('VALIDATING')} type="button">Iniciar validación</button>
        </div>
      )}
      {report.status === 'VALIDATING' && canEdit && (
        <div className="row-actions">
          <button className="btn btn-primary" disabled={saving} onClick={() => void act('READY_FOR_REVIEW')} type="button">Validar y enviar a revisión</button>
        </div>
      )}
      {report.status === 'RETURNED' && canEdit && (
        <div className="row-actions">
          <button className="btn btn-primary" disabled={saving} onClick={() => void act('READY_FOR_REVIEW')} type="button">Reenviar a revisión</button>
        </div>
      )}
      {report.status === 'READY_FOR_REVIEW' && isReviewer && (
        <div className="row-actions">
          <button className="btn btn-primary" disabled={saving} onClick={() => void act('IN_REVIEW')} type="button">Iniciar revisión</button>
        </div>
      )}
      {report.status === 'IN_REVIEW' && (isReviewer || isDeputy) && (
        <section className="panel">
          {isReviewer && <label>
            Comentario de revisión
            <textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={3} />
          </label>}
          <div className="row-actions">
            <button className="btn btn-success" disabled={saving} onClick={() => void act('APPROVED')} type="button">Aprobar</button>
            {isReviewer && <button className="btn btn-warning" disabled={saving || !reviewComment.trim()} onClick={() => void act('RETURNED')} type="button">Devolver con comentario</button>}
          </div>
        </section>
      )}

      {distinctClientWarning(composition.samples) && (
        <p className="notice notice-warning" role="note">El reporte agrupa muestras de distintos clientes. Esta regla sigue pendiente de decisión (DP-003).</p>
      )}

      <section className="panel">
        <h2>Muestras y resultados</h2>
        {composition.samples.map(({ sample }) => sample && (
          <article className="report-sample" key={sample.id}>
            <h3>{sample.code} · {sample.client?.business_name ?? 'Cliente no disponible'}</h3>
            <p>{sample.matrix?.name ?? 'Matriz no disponible'} · Punto: {sample.sampling_point ?? 'No registrado'} · Muestreo: {sample.sampled_at ? formatDateTime(sample.sampled_at) : 'No registrado'} · Recepción: {sample.received_at ? formatDateTime(sample.received_at) : 'No registrada'}</p>
            {sample.observations && <p>Observaciones: {sample.observations}</p>}
          </article>
        ))}
        {composition.regulations.length > 0 && (
          <section>
            <h3>Normativa y límites</h3>
            {composition.regulations.map(({ regulation }) => regulation && (
              <article key={regulation.id}>
                <strong>{regulation.version?.regulation?.code ?? 'Norma'} · {regulation.version?.regulation?.name ?? 'Sin nombre'}</strong>
                <span> · {regulation.version?.activity?.article ?? 'Artículo no registrado'} · {regulation.version?.activity?.activity ?? 'Actividad no registrada'}</span>
                <ul>
                  {(regulation.version?.activity?.limits ?? []).map((limit) => (
                    <li key={`${regulation.id}-${limit.test_id}`}>
                      {limit.limit_text ?? (`${limit.limit_operator ?? ''} ${limit.limit_value ?? ''}`.trim() || limit.special_value || 'Límite no especificado')}
                      {limit.unit ? ` ${limit.unit}` : ''}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        )}
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Ensayo</th><th>Clasificación</th><th>Método / técnica</th><th>LCM / unidad</th><th>Resultado</th><th>Incertidumbre</th><th>Laboratorio</th></tr></thead>
            <tbody>
              {composition.results.map(({ result }) => result && (
                <tr key={result.id}>
                  <td>{result.test?.code ?? 'Ensayo'} · {result.test?.parameter_name ?? 'Parámetro sin nombre'}</td>
                  <td>{result.execution_type === 'SUBCONTRACTED'
                    ? `Subcontratado · ${result.accreditation_type ?? 'acreditación no especificada'}`
                    : result.accreditation_type === 'ACCREDITED'
                      ? 'SA acreditado'
                      : result.accreditation_type === 'NOT_ACCREDITED'
                        ? 'SA no acreditado'
                        : result.accreditation_type ?? 'No especificada'}</td>
                  <td>{result.method_text ?? 'No especificado'} / {result.technique_text ?? 'No especificada'}</td>
                  <td>{result.lcm ?? 'No especificado'} / {result.unit ?? 'No especificada'}</td>
                  <td>{result.original_text ?? result.reported_text ?? (result.numeric_value === null ? 'Sin dato' : String(result.numeric_value))}</td>
                  <td>{result.uncertainty_text ?? 'No especificada'}</td>
                  <td>{result.assigned_laboratory?.name ?? result.laboratory?.name ?? 'No especificado'}</td>
                </tr>
              ))}
              {composition.results.length === 0 && <tr><td colSpan={7}>No hay resultados asociados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Hallazgos de validación</h2>
        {issues.length === 0
          ? <p>No hay hallazgos en la última ejecución de validación.</p>
          : <ul>{issues.map((issue) => <li key={issue.id}>
              <strong>{issue.blocking ? 'Bloqueante' : issue.severity} · {issue.rule_code}:</strong> {issue.message}
              {issue.field_name ? ` (${issue.field_name})` : ''}
            </li>)}</ul>}
      </section>

      <section className="panel">
        <h2>Historial de estados</h2>
        {history.length === 0
          ? <p>No hay transiciones registradas todavía.</p>
          : <ol>{history.map((item, index) => (
              <li key={`${item.created_at}-${index}`}>
                {formatDateTime(item.created_at)} · {item.action}
                {typeof item.new_data?.status === 'string' ? ` · ${statusLabel(item.new_data.status)}` : ''}
                {item.reason ? ` · ${item.reason}` : ''}
              </li>
            ))}</ol>}
        {composition.reviews.map((review) => (
          <p key={review.id}>{formatDateTime(review.created_at)} · Revisión {review.decision}: {review.comments ?? 'Sin comentario'}</p>
        ))}
      </section>

      <section className="panel">
        <h2>Comentarios</h2>
        {composition.comments.map((item) => (
          <p key={item.id}>
            {formatDateTime(item.created_at)} · {item.entity_type === 'REPORT' ? 'Reporte' : item.entity_type === 'RESULT' ? 'Resultado' : 'Campo'}
            {item.entity_id ? ` (${item.entity_id})` : ''}: {item.comment}
          </p>
        ))}
        {canEdit || isReviewer ? (
          <form className="catalog-form" onSubmit={(event) => void submitComment(event)}>
            <label>
              Asociar comentario a
              <select value={commentScope} onChange={(event) => setCommentScope(event.target.value as CommentScope)}>
                <option value="REPORT">Reporte</option>
                <option value="RESULT">Resultado</option>
                <option value="FIELD">Campo</option>
              </select>
            </label>
            {commentScope === 'RESULT' && (
              <label>
                Resultado
                <select value={commentResultId} onChange={(event) => setCommentResultId(event.target.value)}>
                  <option value="">Seleccione un resultado</option>
                  {composition.results.flatMap(({ result }) => result ? [
                    <option key={result.id} value={result.id}>{result.test?.code ?? result.id}</option>,
                  ] : [])}
                </select>
              </label>
            )}
            <label>
              Comentario
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} required rows={3} />
            </label>
            <button className="btn btn-secondary" disabled={saving || !comment.trim() || (commentScope === 'RESULT' && !commentResultId)} type="submit">Agregar comentario</button>
          </form>
        ) : <p>Solo lectura.</p>}
      </section>
      <button className="btn btn-secondary" onClick={() => navigate(-1)} type="button">Volver</button>
    </div>
  )
}

function distinctClientWarning(samples: Array<{ sample: { client_id: string } | null }>): boolean {
  return new Set(samples.flatMap(({ sample }) => sample ? [sample.client_id] : [])).size > 1
}
