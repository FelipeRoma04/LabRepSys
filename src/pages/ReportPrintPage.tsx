/**
 * Vista imprimible del RSA — /reportes/:id/imprimir
 * p12: borrador desde datos vivos (marca BORRADOR); emitido desde snapshot.
 * CSS de impresión: repetir encabezado de tabla, evitar corte de filas.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { getReport, getSnapshot } from '../services/reports'
import { formatDateTime } from '../lib/format'
import type { Report } from '../types/reports'

interface SnapshotData {
  code?: string
  issued_at?: string
  samples?: unknown[]
  results?: unknown[]
}

export function ReportPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [report,   setReport]   = useState<Report | null>(null)
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const timer = window.setTimeout(() => {
      setLoading(true)
      Promise.all([getReport(id), getSnapshot(id)])
        .then(([r, s]) => {
          setReport(r)
          setSnapshot(s?.snapshot_data as SnapshotData ?? null)
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error al cargar.'))
        .finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [id])

  if (loading) return <LoadingState message="Cargando reporte…" />
  if (error || !report) return <ErrorState title="Error" message={error ?? 'Reporte no encontrado.'} />

  const isIssued   = report.status === 'ISSUED'
  const isDraft    = report.status !== 'ISSUED'
  // Emitido: solo desde snapshot; borrador: datos vivos con marca de agua
  const displayCode = isIssued ? (snapshot?.code ?? report.code ?? '—') : '(Borrador)'
  const displayDate = isIssued
    ? formatDateTime(snapshot?.issued_at ?? report.issued_at ?? '', {}, false)
    : formatDateTime(report.updated_at, {}, false)

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
              <tr><th scope="row">Cliente</th><td>{report.client_id ? `[cliente ${report.client_id.slice(0, 8)}]` : 'Pendiente de definición'}</td></tr>
              <tr><th scope="row">Contacto</th><td>{report.contact_id ?? '—'}</td></tr>
            </tbody>
          </table>
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
              {isIssued && snapshot?.results && Array.isArray(snapshot.results) && snapshot.results.length > 0
                ? (snapshot.results as Array<Record<string, unknown>>).map((res, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{String(res.test_id ?? '—')}</td>
                    <td>{String(res.accreditation_type ?? '—')}</td>
                    <td>{String(res.method_text ?? '—')}</td>
                    <td>{String(res.lcm ?? '—')}</td>
                    <td>{String(res.original_text ?? res.reported_text ?? '—')}</td>
                    <td>{String(res.unit ?? '—')}</td>
                  </tr>
                ))
                : (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      {isIssued ? 'Sin resultados en el snapshot.' : 'Pendiente de carga de resultados.'}
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
