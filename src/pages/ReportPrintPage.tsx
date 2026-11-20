/**
 * Vista imprimible del RSA — /reportes/:id/imprimir
 * - Emitido: se imprime SOLO desde el snapshot congelado al emitir.
 * - Borrador: datos vivos con marca BORRADOR, problemas del modelo y decisiones pendientes
 *   (estos avisos no se imprimen).
 * El contenido sale de buildReportModel (src/lib/report): sin convertir ni redondear.
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { RsaSheet } from '../features/rsa/RsaSheet'
import { useAuth } from '../hooks/useAuth'
import { buildReportModel, canIssueReport, REPORT_PENDING_DECISIONS, toReportModelInput } from '../lib/report'
import { loadReportPrintData, type ReportPrintData } from '../services/reportPrint'
import { getFinalReportPdfUrl, listReportFiles, uploadFinalReportPdf, type ReportFileRow } from '../services/reports'

export function ReportPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<ReportPrintData | null>(null)
  const [files, setFiles] = useState<ReportFileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileMessage, setFileMessage] = useState<string | null>(null)
  const [busyFile, setBusyFile] = useState(false)
  const { roles } = useAuth()
  const canRegisterPdf = roles.some((role) => role.code === 'ADMIN')

  useEffect(() => {
    if (!id) return
    const timer = window.setTimeout(() => {
      setLoading(true)
      Promise.all([loadReportPrintData(id), listReportFiles(id)])
        .then(([printData, reportFiles]) => {
          setData(printData)
          setFiles(reportFiles)
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Error al cargar el reporte.'))
        .finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [id])

  const model = useMemo(() => data
    ? buildReportModel(toReportModelInput(data.records, { draftDate: data.report.updated_at }))
    : null, [data])

  const uploadFinalPdf = async (file?: File) => {
    if (!id || !file) return
    setBusyFile(true)
    setFileMessage(null)
    try {
      const row = await uploadFinalReportPdf(id, file)
      setFiles((current) => [row, ...current])
      setFileMessage('PDF final registrado con SHA-256.')
    } catch (cause) {
      setFileMessage(cause instanceof Error ? cause.message : 'No se pudo registrar el PDF final.')
    } finally { setBusyFile(false) }
  }

  const downloadFinalPdf = async (path: string) => {
    setBusyFile(true)
    setFileMessage(null)
    try {
      const url = await getFinalReportPdfUrl(path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (cause) {
      setFileMessage(cause instanceof Error ? cause.message : 'No se pudo crear el enlace de descarga.')
    } finally { setBusyFile(false) }
  }

  if (loading) return <LoadingState message="Cargando reporte…" />
  if (error || !data || !model) return <ErrorState title="Error" message={error ?? 'Reporte no encontrado.'} />

  const isIssued = data.report.status === 'ISSUED'
  const blocking = model.issues.filter((issue) => issue.severity === 'BLOCKING')
  const warnings = model.issues.filter((issue) => issue.severity === 'WARNING')

  return (
    <div className="print-container">
      <div className="print-controls no-print">
        <button className="btn btn-primary" onClick={() => window.print()} type="button">
          Imprimir / Guardar PDF
        </button>
        <button className="btn btn-secondary" onClick={() => window.history.back()} type="button">
          Volver
        </button>
        {!isIssued && (
          <p className="print-disclaimer" role="alert">
            Vista de borrador: los datos pueden cambiar hasta la emisión.
          </p>
        )}
        {isIssued && <p className="print-disclaimer">Reporte emitido: contenido tomado del snapshot congelado al emitir.</p>}
        {isIssued && canRegisterPdf && <label className="no-print print-file-upload">
          Registrar PDF final
          <input accept="application/pdf,.pdf" disabled={busyFile} onChange={(event) => { void uploadFinalPdf(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} type="file" />
        </label>}
        {fileMessage && <p className="no-print" role="status">{fileMessage}</p>}
        {isIssued && files.filter((file) => file.file_type === 'FINAL_PDF').map((file) => <div className="no-print" key={file.id}>
          <span>PDF final · SHA-256 {file.sha256}</span>
          {canRegisterPdf && <button className="btn btn-secondary" disabled={busyFile} onClick={() => void downloadFinalPdf(file.storage_path)} type="button">Descargar PDF</button>}
        </div>)}
      </div>

      {!isIssued && (
        <section className="rsa-report-issues no-print" aria-label="Revisión antes de emitir">
          <h2>{canIssueReport(model) ? 'Sin problemas que bloqueen la emisión' : `${blocking.length} problema(s) impiden emitir`}</h2>
          {blocking.length > 0 && <ul>{blocking.map((issue, index) => <li key={`b-${index}`}><strong>Bloquea:</strong> {issue.message}</li>)}</ul>}
          {warnings.length > 0 && (
            <details>
              <summary>{warnings.length} advertencia(s)</summary>
              <ul>{warnings.map((issue, index) => <li key={`w-${index}`}>{issue.message}</li>)}</ul>
            </details>
          )}
          <details>
            <summary>Decisiones pendientes que afectan este reporte ({REPORT_PENDING_DECISIONS.length})</summary>
            <ul>
              {REPORT_PENDING_DECISIONS.map((decision) => (
                <li key={decision.code}><strong>{decision.code} · {decision.title}:</strong> {decision.currentBehavior}</li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <RsaSheet model={model} signerName={data.approvedByName} templateConfig={data.templateConfig} />
    </div>
  )
}
