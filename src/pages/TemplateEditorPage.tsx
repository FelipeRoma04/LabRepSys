/**
 * Editor de plantillas de reporte — K03
 * Ruta: /catalogos/plantillas/:id/editar
 *
 * Req 1.1–4.2: formulario por secciones, validación, subida de logos/firma,
 * flujo DRAFT→APPROVED→RETIRED, vista previa con datos DEMO.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { useAuth } from '../hooks/useAuth'
import {
  listTemplates,
  saveTemplateDraft,
  approveTemplate,
  newTemplateVersion,
  retireTemplate,
  uploadTemplateAsset,
  type TemplateRow,
} from '../services/templateEditor'
import { EMPTY_TEMPLATE_CONFIG, DEFAULT_RESULT_COLUMNS } from '../types/templateConfig'
import type { TemplateConfig, ResultTableColumn } from '../types/templateConfig'

// ─── Validación ───────────────────────────────────────────────────────────────

interface ValidationErrors {
  [field: string]: string
}

function validateConfig(cfg: TemplateConfig): ValidationErrors {
  const errors: ValidationErrors = {}
  if (!cfg.header.organizationName.trim())
    errors['header.organizationName'] = 'El nombre de la organización es obligatorio.'
  if (!cfg.header.laboratoryName.trim())
    errors['header.laboratoryName'] = 'El nombre del laboratorio es obligatorio.'
  if (!cfg.header.templateCode.trim())
    errors['header.templateCode'] = 'El código de plantilla es obligatorio.'
  if (cfg.resultColumns.filter((c) => c.visible).length === 0)
    errors['resultColumns'] = 'Al menos una columna debe ser visible.'
  return errors
}

// ─── Componente ───────────────────────────────────────────────────────────────

type TabKey = 'encabezado' | 'textos' | 'columnas' | 'firma' | 'paginacion' | 'preview'

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { roles } = useAuth()

  const isAdmin = roles.some((r) => r.code === 'ADMIN')
  const isJTC = roles.some((r) => r.code === 'JEFE_TECNICA_CALIDAD')

  const [template, setTemplate] = useState<TemplateRow | null>(null)
  const [config, setConfig] = useState<TemplateConfig>(EMPTY_TEMPLATE_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [tab, setTab] = useState<TabKey>('encabezado')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const sigInputRef = useRef<HTMLInputElement>(null)

  const isDraft = template?.status === 'DRAFT'
  const isReadOnly = !isDraft || !isAdmin

  // ── Cargar plantilla ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setLoadError(null)
      void listTemplates()
      .then((rows) => {
        if (cancelled) return
        const found = rows.find((r) => r.id === id)
        if (!found) {
          setLoadError('Plantilla no encontrada.')
          return
        }
        setTemplate(found)
        // Merge con defaults para tolerar configuraciones parciales
        setConfig({
          ...EMPTY_TEMPLATE_CONFIG,
          ...(found.configuration ?? {}),
          resultColumns: (found.configuration?.resultColumns ?? DEFAULT_RESULT_COLUMNS),
        })
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Error al cargar.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [id])

  // ── Guardar ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!id || !isDraft) return
    const errors = validateConfig(config)
    setValidationErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      await saveTemplateDraft(id, config)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 3000)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Error al guardar.')
    } finally {
      setSaving(false)
    }
  }, [id, isDraft, config])

  // ── Aprobar ─────────────────────────────────────────────────────────────────
  const handleApprove = useCallback(async () => {
    if (!id) return
    try {
      const result = await approveTemplate(id)
      if (!result.ok) {
        setSaveError(result.message ?? 'No se pudo aprobar la plantilla.')
        return
      }
      setTemplate((t) => t ? { ...t, status: 'APPROVED' } : t)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se pudo aprobar la plantilla.')
    }
  }, [id])

  // ── Nueva versión ───────────────────────────────────────────────────────────
  const handleNewVersion = useCallback(async () => {
    if (!id) return
    try {
      const result = await newTemplateVersion(id)
      if (!result.ok || !result.newId) {
        setSaveError(result.message ?? 'No se pudo crear nueva versión.')
        return
      }
      navigate(`/catalogos/plantillas/${result.newId}/editar`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se pudo crear nueva versión.')
    }
  }, [id, navigate])

  // ── Retirar ─────────────────────────────────────────────────────────────────
  const handleRetire = useCallback(async () => {
    if (!id) return
    if (!window.confirm('¿Confirma retirar esta versión de plantilla?')) return
    try {
      await retireTemplate(id)
      setTemplate((t) => t ? { ...t, status: 'RETIRED' } : t)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Error al retirar.')
    }
  }, [id])

  // ── Subir logo ───────────────────────────────────────────────────────────────
  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    try {
      const path = await uploadTemplateAsset(id, 'logo', file)
      setConfig((c) => ({ ...c, header: { ...c.header, logoPath: path } }))
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Error al subir el logo.')
    }
  }, [id])

  const handleSigUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    try {
      const path = await uploadTemplateAsset(id, 'signature', file)
      setConfig((c) => ({ ...c, signature: { ...c.signature, signatureImagePath: path } }))
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Error al subir la firma.')
    }
  }, [id])

  // ── Validar capacidades de impresión en preview ──────────────────────────────
  const previewWarnings = useMemo(() => {
    if (tab !== 'preview' || !config.pagination.repeatTableHeader) return []
    if (CSS.supports('break-inside', 'avoid')) return []
    return ['Este navegador puede no soportar la regla de paginación "evitar corte de filas".']
  }, [tab, config.pagination.repeatTableHeader])

  // ── Toggle columna ───────────────────────────────────────────────────────────
  const toggleColumn = (key: string) => {
    setConfig((c) => ({
      ...c,
      resultColumns: c.resultColumns.map((col: ResultTableColumn) =>
        col.key === key ? { ...col, visible: !col.visible } : col
      ),
    }))
  }

  if (loading) return <LoadingState message="Cargando plantilla…" />
  if (loadError) return <ErrorState title="Error" message={loadError} />
  if (!template) return <ErrorState title="No encontrada" message="La plantilla no existe." />

  const statusTone =
    template.status === 'APPROVED' ? 'success'
    : template.status === 'DRAFT' ? 'warning'
    : 'neutral'

  return (
    <div>
      <PageHeader
        title={`Plantilla ${template.code} v${template.version}`}
        description={isDraft ? 'Borrador — editable.' : 'Esta plantilla es de solo lectura.'}
      >
        <StatusBadge
          tone={statusTone}
          label={template.status === 'DRAFT' ? 'Borrador' : template.status === 'APPROVED' ? 'Aprobada' : 'Retirada'}
        />
      </PageHeader>

      {saveError && <ErrorState title="Error" message={saveError} />}
      {saveOk && <p className="save-ok-banner" role="status">Cambios guardados correctamente.</p>}

      {/* Acciones de estado */}
      <div className="template-actions">
        {isDraft && isAdmin && (
          <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving} type="button">
            {saving ? 'Guardando…' : 'Guardar borrador'}
          </button>
        )}
        {isDraft && isJTC && (
          <button className="btn btn-success" onClick={() => void handleApprove()} type="button">
            Aprobar plantilla
          </button>
        )}
        {template.status === 'APPROVED' && isAdmin && (
          <button className="btn btn-secondary" onClick={() => void handleNewVersion()} type="button">
            Nueva versión
          </button>
        )}
        {(template.status === 'APPROVED' || isDraft) && isAdmin && (
          <button className="btn btn-danger" onClick={() => void handleRetire()} type="button">
            Retirar
          </button>
        )}
      </div>

      {/* Pestañas */}
      <div className="tabs" role="tablist">
        {(['encabezado', 'textos', 'columnas', 'firma', 'paginacion', 'preview'] as TabKey[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`tab${tab === t ? ' tab-active' : ''}`}
            onClick={() => setTab(t)}
            type="button"
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Encabezado ─────────────────────────────────────────────────────── */}
      {tab === 'encabezado' && (
        <form className="template-form" onSubmit={(e) => e.preventDefault()}>
          <fieldset disabled={isReadOnly}>
            <legend>Encabezado</legend>

            <label>
              Nombre de la organización *
              <input
                type="text"
                value={config.header.organizationName}
                onChange={(e) => setConfig((c) => ({ ...c, header: { ...c.header, organizationName: e.target.value } }))}
              />
              {validationErrors['header.organizationName'] && (
                <span className="field-error">{validationErrors['header.organizationName']}</span>
              )}
            </label>

            <label>
              Nombre del laboratorio *
              <input
                type="text"
                value={config.header.laboratoryName}
                onChange={(e) => setConfig((c) => ({ ...c, header: { ...c.header, laboratoryName: e.target.value } }))}
              />
              {validationErrors['header.laboratoryName'] && (
                <span className="field-error">{validationErrors['header.laboratoryName']}</span>
              )}
            </label>

            <label>
              Código de plantilla *
              <input
                type="text"
                value={config.header.templateCode}
                onChange={(e) => setConfig((c) => ({ ...c, header: { ...c.header, templateCode: e.target.value } }))}
              />
              {validationErrors['header.templateCode'] && (
                <span className="field-error">{validationErrors['header.templateCode']}</span>
              )}
            </label>

            <label>
              Etiqueta del tipo de documento
              <input
                type="text"
                value={config.header.documentTypeLabel}
                onChange={(e) => setConfig((c) => ({ ...c, header: { ...c.header, documentTypeLabel: e.target.value } }))}
              />
            </label>

            <label>
              Logo principal (imagen en bucket privado)
              {config.header.logoPath && (
                <p className="asset-path">Ruta actual: <code>{config.header.logoPath}</code></p>
              )}
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(e) => void handleLogoUpload(e)} />
            </label>
          </fieldset>
        </form>
      )}

      {/* ── Textos ─────────────────────────────────────────────────────────── */}
      {tab === 'textos' && (
        <form className="template-form" onSubmit={(e) => e.preventDefault()}>
          <fieldset disabled={isReadOnly}>
            <legend>Textos fijos y declaraciones</legend>
            <p className="template-form-note">
              Estos campos deben contener únicamente el texto aprobado por Calidad.
              No se redactan textos legales nuevos aquí.
            </p>
            {(
              [
                ['accreditationDeclaration', 'Declaración de acreditación IDEAM'],
                ['subcontractedNote', 'Nota de ensayos subcontratados'],
                ['nonAccreditedNote', 'Nota de ensayos no acreditados'],
                ['samplesOnlyDeclaration', 'Declaración: resultados se refieren solo a las muestras'],
                ['footer', 'Pie de página'],
                ['additionalObservations', 'Observaciones adicionales fijas'],
              ] as [keyof typeof config.texts, string][]
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  rows={3}
                  value={config.texts[key] ?? ''}
                  onChange={(e) => setConfig((c) => ({ ...c, texts: { ...c.texts, [key]: e.target.value } }))}
                />
              </label>
            ))}
          </fieldset>
        </form>
      )}

      {/* ── Columnas ───────────────────────────────────────────────────────── */}
      {tab === 'columnas' && (
        <div className="template-form">
          <p>Selecciona las columnas que aparecerán en la tabla de resultados.</p>
          {validationErrors['resultColumns'] && (
            <span className="field-error">{validationErrors['resultColumns']}</span>
          )}
          <ul className="column-toggle-list">
            {config.resultColumns.map((col: ResultTableColumn) => (
              <li key={col.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={col.visible}
                    disabled={isReadOnly}
                    onChange={() => toggleColumn(col.key)}
                  />
                  {col.label}
                </label>
              </li>
            ))}
          </ul>
          <label>
            Máximo de columnas de límites normativos
            <select
              value={config.maxLimitColumns}
              disabled={isReadOnly}
              onChange={(e) => setConfig((c) => ({ ...c, maxLimitColumns: Number(e.target.value) as 1 | 2 | 3 | 4 }))}
            >
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}

      {/* ── Firma ──────────────────────────────────────────────────────────── */}
      {tab === 'firma' && (
        <form className="template-form" onSubmit={(e) => e.preventDefault()}>
          <fieldset disabled={isReadOnly}>
            <legend>Firma y responsable</legend>
            <p className="template-form-note">
              Mecanismo provisional: imagen de firma desde bucket privado (DP-012 — firma digital pendiente).
            </p>
            <label>
              Título del firmante
              <input
                type="text"
                value={config.signature.signerTitle}
                onChange={(e) => setConfig((c) => ({ ...c, signature: { ...c.signature, signerTitle: e.target.value } }))}
              />
            </label>
            <label>
              Etiqueta de nombre del firmante
              <input
                type="text"
                value={config.signature.signerNamePlaceholder}
                onChange={(e) => setConfig((c) => ({ ...c, signature: { ...c.signature, signerNamePlaceholder: e.target.value } }))}
              />
            </label>
            <label>
              Imagen de firma (bucket signatures)
              {config.signature.signatureImagePath && (
                <p className="asset-path">Ruta actual: <code>{config.signature.signatureImagePath}</code></p>
              )}
              <input ref={sigInputRef} type="file" accept="image/png,image/jpeg" onChange={(e) => void handleSigUpload(e)} />
            </label>
          </fieldset>
        </form>
      )}

      {/* ── Paginación ─────────────────────────────────────────────────────── */}
      {tab === 'paginacion' && (
        <form className="template-form" onSubmit={(e) => e.preventDefault()}>
          <fieldset disabled={isReadOnly}>
            <legend>Reglas de paginación</legend>
            <label>
              <input
                type="checkbox"
                checked={config.pagination.repeatTableHeader}
                onChange={(e) => setConfig((c) => ({ ...c, pagination: { ...c.pagination, repeatTableHeader: e.target.checked } }))}
              />
              Repetir encabezado de tabla en cada página
            </label>
            <label>
              <input
                type="checkbox"
                checked={config.pagination.avoidRowBreak}
                onChange={(e) => setConfig((c) => ({ ...c, pagination: { ...c.pagination, avoidRowBreak: e.target.checked } }))}
              />
              Evitar cortar filas entre páginas
            </label>
          </fieldset>
        </form>
      )}

      {/* ── Vista previa ───────────────────────────────────────────────────── */}
      {tab === 'preview' && (
        <div className="template-preview">
          {previewWarnings.length > 0 && (
            <div className="template-preview-warnings" role="alert">
              {previewWarnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          <div className="template-preview-sheet" aria-label="Vista previa de plantilla">
            {/* Marca de agua BORRADOR — siempre en preview */}
            <div className="watermark" aria-hidden="true">BORRADOR</div>

            <header className="rsa-header">
              <h1>{config.header.organizationName || '—'}</h1>
              <p>{config.header.laboratoryName || '—'}</p>
              <p><strong>{config.header.documentTypeLabel || 'Reporte de Resultados de Análisis'}</strong></p>
              <p>Plantilla: {config.header.templateCode || '—'}</p>
            </header>

            <section className="rsa-demo-info">
              <p><strong>Cliente:</strong> Cliente DEMO</p>
              <p><strong>Muestra:</strong> AG0346 — Agua residual doméstica</p>
              <p><strong>Fecha de muestreo:</strong> 29/05/2026</p>
            </section>

            <table className="rsa-results-table">
              <thead>
                <tr>
                  {config.resultColumns.filter((c) => c.visible).map((col) => (
                    <th key={col.key} scope="col">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {config.resultColumns.filter((c) => c.visible).map((col) => (
                    <td key={col.key}>{col.key === 'result' ? '< 0,040' : 'DEMO'}</td>
                  ))}
                </tr>
              </tbody>
            </table>

            <footer className="rsa-footer">
              <p>{config.texts.footer || '—'}</p>
              <p>{config.texts.samplesOnlyDeclaration || ''}</p>
              <div className="rsa-signature">
                <p>{config.signature.signerTitle || '—'}</p>
                <p>{config.signature.signerNamePlaceholder || '—'}</p>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
