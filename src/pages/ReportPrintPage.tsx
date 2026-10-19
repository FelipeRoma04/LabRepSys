/**
 * Vista imprimible del RSA — /reportes/:id/imprimir
 * p12: borrador desde datos vivos (marca BORRADOR); emitido desde snapshot.
 * CSS de impresión: repetir encabezado de tabla, evitar corte de filas.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { getFinalReportPdfUrl, getReport, getSnapshot, listReportFiles, uploadFinalReportPdf, type ReportFileRow } from '../services/reports'
import { getReportComposition } from '../services/reportBuilder'
import { formatDateTime } from '../lib/format'
import type { Report } from '../types/reports'
import { useAuth } from '../hooks/useAuth'

interface SnapshotData {
  code?: string
  issued_at?: string
  client?: { business_name?: string } | null
  contact?: { name?: string } | null
  samples?: Array<Record<string, unknown>>
  results?: Array<Record<string, unknown>>
  regulations?: Array<Record<string, unknown>>
}

export function ReportPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [report,   setReport]   = useState<Report | null>(null)
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null)
  const [composition, setComposition] = useState<Awaited<ReturnType<typeof getReportComposition>> | null>(null)
  const [files, setFiles] = useState<ReportFileRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [fileMessage, setFileMessage] = useState<string | null>(null)
  const [busyFile, setBusyFile] = useState(false)
  const { roles } = useAuth()
  const canRegisterPdf = roles.some((role) => role.code === 'ADMIN')

  useEffect(() => {
    if (!id) return
    const timer = window.setTimeout(() => {
      setLoading(true)
      Promise.all([getReport(id), getSnapshot(id), getReportComposition(id), listReportFiles(id)])
        .then(([r, s, c, reportFiles]) => {
          setReport(r)
          setSnapshot(s?.snapshot_data as SnapshotData ?? null)
          setComposition(c)
          setFiles(reportFiles)
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error al cargar.'))
        .finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [id])

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
  if (error || !report) return <ErrorState title="Error" message={error ?? 'Reporte no encontrado.'} />

  const isIssued   = report.status === 'ISSUED'
  const isDraft    = report.status !== 'ISSUED'
  // Emitido: solo desde snapshot; borrador: datos vivos con marca de agua
  const displayCode = isIssued ? (snapshot?.code ?? report.code ?? '—') : '(Borrador)'
  const displayDate = isIssued
    ? formatDateTime(snapshot?.issued_at ?? report.issued_at ?? '', {}, false)
    : formatDateTime(report.updated_at, {}, false)
  const sampleRows = isIssued
    ? snapshot?.samples ?? []
    : (composition?.samples ?? []).flatMap((row) => row.sample ? [row.sample as unknown as Record<string, unknown>] : [])
  const resultRows = isIssued
    ? snapshot?.results ?? []
    : (composition?.results ?? []).flatMap((row) => row.result ? [row.result as unknown as Record<string, unknown>] : [])
  const firstSample = sampleRows[0]
  const sampleClient = firstSample?.client as { business_name?: string } | null | undefined

  return (
    <div className="print-container">
      {/* Controles de pantalla — ocultos al imprimir */}
      <div className="print-controls no-print">
        <button className="btn btn-primary" onClick={() => window.print()} type="button">
          Imprimir / Guardar PDF
        </button>
        <button className="btn btn-secondary" onClick={() => window.history.back()} type="button">
          Volver
        </button>
        {isDraft && (
          <p className="print-disclaimer" role="alert">
            Vista de borrador — los datos pueden cambiar hasta la emisión.
          </p>
        )}
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

      {/* Hoja del reporte */}
      <article className="rsa-sheet" aria-label={`Reporte ${displayCode}`}>
        {/* Marca de agua BORRADOR */}
        {isDraft && <div className="watermark" aria-hidden="true">BORRADOR</div>}

        {/* Encabezado */}
        <header className="rsa-header">
          <div className="rsa-header-org">
            <h1>Grupo Sierra Alta S.A.S.</h1>
            <p>Laboratorio de Análisis Ambiental</p>
          </div>
          <div className="rsa-header-meta">
            <p><strong>RSA N.°</strong> {displayCode}</p>
            <p><strong>Fecha de emisión:</strong> {displayDate}</p>
            <p><strong>Versión:</strong> {report.version}</p>
          </div>
        </header>

        {/* Información de la muestra — pendiente de datos reales (p03/p04) */}
        <section className="rsa-client-info" aria-label="Información del cliente">
          <table className="rsa-info-table">
            <tbody>
              <tr><th scope="row">Cliente</th><td>{isIssued ? snapshot?.client?.business_name ?? 'No incluido en el snapshot' : sampleClient?.business_name ?? 'Pendiente de selección'}</td></tr>
              <tr><th scope="row">Contacto</th><td>{isIssued ? snapshot?.contact?.name ?? 'No incluido en el snapshot' : report.contact_id ?? '—'}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="rsa-samples-section" aria-label="Muestras del reporte">
          <h2>Muestras</h2>
          {sampleRows.length ? <table className="rsa-info-table"><thead><tr><th>Código</th><th>Punto</th><th>Matriz</th><th>Muestreo</th><th>Recepción</th></tr></thead><tbody>
            {sampleRows.map((sample, index) => {
              const matrix = sample.matrix as { name?: string } | null | undefined
              return <tr key={String(sample.id ?? index)}><td>{String(sample.code ?? '—')}</td><td>{String(sample.sampling_point ?? '—')}</td><td>{matrix?.name ?? '—'}</td><td>{sample.sampled_at ? formatDateTime(String(sample.sampled_at), {}, false) : '—'}</td><td>{sample.received_at ? formatDateTime(String(sample.received_at), {}, false) : '—'}</td></tr>
            })}
          </tbody></table> : <p>No hay muestras incluidas.</p>}
        </section>

        {/* Tabla de resultados */}
        <section className="rsa-results-section" aria-label="Resultados de análisis">
          <h2>Resultados de análisis</h2>
          <table className="rsa-results-table">
            <thead>
              <tr>
                <th scope="col">Ítem</th>
                <th scope="col">Ensayo / Parámetro</th>
                <th scope="col">Acreditación</th>
                <th scope="col">Método</th>
                <th scope="col">LCM</th>
                <th scope="col">Resultado</th>
                <th scope="col">Unidad</th>
              </tr>
            </thead>
            <tbody>
              {/* Datos vivos o del snapshot */}
              {resultRows.length > 0
                ? resultRows.map((res, i) => {
                  const test = res.test as { code?: string; parameter_name?: string } | null | undefined
                  return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{test?.code ?? String(res.test_id ?? '—')} · {test?.parameter_name ?? ''}</td>
                    <td>{String(res.accreditation_type ?? '—')}</td>
                    <td>{String(res.method_text ?? '—')}</td>
                    <td>{String(res.lcm ?? '—')}</td>
                    <td>{String(res.original_text ?? res.reported_text ?? '—')}</td>
                    <td>{String(res.unit ?? '—')}</td>
                  </tr>
                  )
                })
                : (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      {isIssued ? 'Sin resultados en el snapshot.' : 'No hay resultados incluidos.'}
                    </td>
                  </tr>
                )
              }
            </tbody>
          </table>
        </section>

        {/* Notas de acreditación IDEAM — texto desde configuración de plantilla */}
        <section className="rsa-declarations" aria-label="Declaraciones">
          <p className="rsa-declaration-placeholder">
            [Declaración de acreditación — configurable en la plantilla]
          </p>
          <p className="rsa-declaration-placeholder">
            Los resultados se refieren únicamente a las muestras analizadas.
          </p>
        </section>

        {/* Firma */}
        <footer className="rsa-footer">
          <div className="rsa-signature">
            <div className="signature-line" aria-label="Firma del responsable" />
            <p>Jefa de Técnica y Calidad</p>
          </div>
          <p className="rsa-footer-note">
            Página <span className="page-number" aria-hidden="true" /> de <span className="page-count" aria-hidden="true" />
          </p>
        </footer>
      </article>
    </div>
  )
}
