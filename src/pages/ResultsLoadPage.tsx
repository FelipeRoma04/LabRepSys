/**
 * Página de carga de resultados — /resultados/carga
 * p07: carga de PDF, pegado y digitación manual.
 */
import { useCallback, useRef, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { StatusBadge } from '../components/StatusBadge'
import { parseResult } from '../lib/parseResult'
import { formatResult } from '../lib/format'
import { findAdapter } from '../lib/pdfAdapter'
// Registrar adaptadores al importar
import '../lib/adapters/agq'
import '../lib/adapters/chemilab'
import '../lib/adapters/iha'

interface ParsedRow {
  raw: string
  parsed: ReturnType<typeof parseResult>
}

type TabKey = 'pdf' | 'paste' | 'manual'

export function ResultsLoadPage() {
  const [tab, setTab] = useState<TabKey>('paste')
  const [pasteText, setPasteText] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [pdfWarning, setPdfWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Parseo desde pegado ───────────────────────────────────────────────────
  const handleParse = useCallback(() => {
    const lines = pasteText.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) { setError('No hay datos para procesar.'); return }
    setError(null)
    setParsedRows(lines.map((raw) => ({ raw, parsed: parseResult(raw) })))
  }, [pasteText])

  // ── Carga de PDF ─────────────────────────────────────────────────────────
  const handlePdfLoad = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfWarning(null)
    setError(null)

    try {
      // Extraer texto del PDF con pdfjs-dist si está disponible
      // Por ahora: leer como texto plano para detección del adaptador
      const text = await file.text().catch(() => '')
      const adapter = findAdapter(text)

      if (!adapter) {
        setPdfWarning(
          'No se encontró un adaptador para este PDF. ' +
          'Use el pegado o digitación manual con el PDF visible al lado.',
        )
        return
      }

      const result = adapter.extract(text)

      if (result.requiresManualCapture) {
        setPdfWarning(result.warnings?.join(' ') ?? 'Este PDF requiere captura manual.')
        return
      }

      // Parsear las filas extraídas
      setParsedRows(
        result.rows.map((row) => ({
          raw: row.externalResult,
          parsed: parseResult(row.externalResult),
        })),
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al leer el archivo.')
    }
  }, [])

  const pendingCount = parsedRows.filter((r) => r.parsed.pendingConfirmation).length
  const readyCount   = parsedRows.filter((r) => !r.parsed.pendingConfirmation).length

  return (
    <div>
      <PageHeader
        title="Carga de resultados"
        description="Importa resultados desde PDF, pegado de Excel o digitación manual."
      />

      {error && <ErrorState title="Error" message={error} />}

      {/* Pestañas de entrada */}
      <div className="tabs" role="tablist">
        {(['pdf', 'paste', 'manual'] as TabKey[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`tab${tab === t ? ' tab-active' : ''}`}
            onClick={() => { setTab(t); setParsedRows([]); setError(null); setPdfWarning(null) }}
            type="button"
          >
            {t === 'pdf' ? 'Desde PDF' : t === 'paste' ? 'Pegar desde Excel' : 'Digitación manual'}
          </button>
        ))}
      </div>

      {/* ── PDF ──────────────────────────────────────────────────────────── */}
      {tab === 'pdf' && (
        <div className="load-section">
          <p className="load-note">
            Se detecta automáticamente el laboratorio. Si el PDF no tiene capa de texto
            o el adaptador no está implementado, se mostrará el PDF para captura manual.
          </p>
          {pdfWarning && (
            <div className="load-warning" role="alert">
              <strong>Captura manual requerida:</strong> {pdfWarning}
            </div>
          )}
          <label className="file-upload-label">
            Seleccionar PDF
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => void handlePdfLoad(e)}
            />
          </label>
        </div>
      )}

      {/* ── Pegado ───────────────────────────────────────────────────────── */}
      {tab === 'paste' && (
        <div className="load-section">
          <label>
            Pega los resultados (un resultado por línea):
            <textarea
              rows={10}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'< 0,040\n3,5\nPresencia\n...'}
              className="paste-area"
            />
          </label>
          <button
            className="btn btn-primary"
            onClick={handleParse}
            type="button"
            disabled={!pasteText.trim()}
          >
            Procesar resultados
          </button>
        </div>
      )}

      {/* ── Manual ───────────────────────────────────────────────────────── */}
      {tab === 'manual' && (
        <EmptyState
          title="Digitación manual"
          description="Pendiente de implementación en p07. Requiere que Copilot termine la recepción de muestras (p04) para vincular los ensayos."
        />
      )}

      {/* ── Tabla de vista previa ─────────────────────────────────────────── */}
      {parsedRows.length > 0 && (
        <div className="parse-results">
          <div className="parse-summary">
            <StatusBadge tone="success" label={`${readyCount} listo${readyCount !== 1 ? 's' : ''}`} />
            {pendingCount > 0 && (
              <StatusBadge tone="warning" label={`${pendingCount} requiere${pendingCount !== 1 ? 'n' : ''} confirmación`} />
            )}
          </div>

          <table className="data-table" aria-label="Vista previa de resultados">
            <thead>
              <tr>
                <th scope="col">Texto original</th>
                <th scope="col">Tipo</th>
                <th scope="col">Resultado formateado</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {parsedRows.map((row, i) => (
                <tr key={i}>
                  <td><code>{row.raw}</code></td>
                  <td>{row.parsed.type}</td>
                  <td>
                    {row.parsed.type === 'numeric'
                      ? formatResult({
                          operator: row.parsed.operator,
                          numericValue: row.parsed.numericValue,
                          decimalPlaces: row.parsed.decimalPlaces,
                          originalText: row.parsed.originalText,
                        })
                      : row.parsed.type === 'range'
                        ? `${row.parsed.rangeMin} – ${row.parsed.rangeMax}`
                        : row.parsed.originalText}
                  </td>
                  <td>
                    {row.parsed.pendingConfirmation
                      ? <StatusBadge tone="warning" label="Confirmar" />
                      : <StatusBadge tone="success" label="OK" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
