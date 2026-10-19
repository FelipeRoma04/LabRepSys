import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import { formatDateTime } from '../lib/format'
import { createStorageSignedUrl } from '../services/storage'
import {
  detectReconciliationIssues,
  getReconciliationOptions,
  listIssues,
  resolveIssue,
} from '../services/results'
import type {
  IssueType,
  ReconciliationDecision,
  ReconciliationIssue,
  ReconciliationOptions,
} from '../types/results'

const issueTypeLabels: Record<IssueType, string> = {
  DATE_MISMATCH: 'Fecha distinta',
  MATRIX_MISMATCH: 'Matriz distinta',
  UNREQUESTED_PARAMETER: 'Parámetro no solicitado',
  MISSING_RESULT: 'Ensayo sin resultado',
  LCM_MISMATCH: 'LCM distinto',
  METHOD_MISMATCH: 'Método distinto',
  UNIT_MISMATCH: 'Unidad distinta',
  TECHNIQUE_MISMATCH: 'Técnica distinta',
  DUPLICATE_RESULT: 'Resultado duplicado',
  LAB_DEVIATION: 'Desviación del laboratorio',
  LEGACY_CODE_NO_MAPPING: 'Código heredado sin mapeo',
  INCOMPLETE_TEST_FIELDS: 'Ensayo con campos incompletos',
  EXTERNAL_REPORT_PENDING: 'Reporte externo pendiente',
  REGULATION_MISMATCH: 'Diferencia de normativa cotizada',
}

type Decision = ReconciliationDecision

function sampleCode(issue: ReconciliationIssue): string {
  return issue.sample?.code ?? issue.demo_sample_code ?? 'Muestra sin código'
}

function isResultIssue(issue: ReconciliationIssue): boolean {
  return ['LCM_MISMATCH', 'METHOD_MISMATCH', 'UNIT_MISMATCH', 'TECHNIQUE_MISMATCH']
    .includes(issue.issue_type)
}

export function ReconciliationPage() {
  const { roles } = useAuth()
  const canResolve = roles.some((role) => ['ADMIN', 'ANALISTA'].includes(role.code))
  const canRequestReview = canResolve || roles.some((role) => role.code === 'JEFE_TECNICA_CALIDAD')
  const [issues, setIssues] = useState<ReconciliationIssue[]>([])
  const [options, setOptions] = useState<ReconciliationOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReconciliationIssue | null>(null)
  const [decision, setDecision] = useState<Decision>('ACCEPT_A')
  const [selectedSource, setSelectedSource] = useState('')
  const [selectedValue, setSelectedValue] = useState('')
  const [mappedTestId, setMappedTestId] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [filterSampleId, setFilterSampleId] = useState('')
  const [filterType, setFilterType] = useState<IssueType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'OPEN' | 'RESOLVED'>('OPEN')
  const [showDemo, setShowDemo] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [loadedIssues, loadedOptions] = await Promise.all([
        listIssues(),
        getReconciliationOptions(),
      ])
      setIssues(loadedIssues)
      setOptions(loadedOptions)
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'No se pudieron cargar las inconsistencias.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    let cancelled = false
    if (!selected?.storage_path) return
    const timer = window.setTimeout(() => {
      void createStorageSignedUrl('source-files', selected.storage_path!)
        .then((url) => {
          if (!cancelled) setEvidenceUrl(url)
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setEvidenceError(cause instanceof Error ? cause.message : 'No se pudo preparar el archivo de evidencia.')
          }
        })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [selected])

  const filtered = useMemo(() => issues.filter((issue) => {
    const issueSampleId = issue.sample_id ?? ''
    return (statusFilter === 'all' || issue.status === statusFilter) &&
      (filterSampleId === '' || issueSampleId === filterSampleId) &&
      (filterType === 'all' || issue.issue_type === filterType) &&
      (showDemo || !issue.is_demo)
  }), [filterSampleId, filterType, issues, showDemo, statusFilter])

  const beginDecision = (issue: ReconciliationIssue) => {
    setSelected(issue)
    setEvidenceUrl(null)
    setEvidenceError(null)
    const initialDecision: Decision = !canResolve
      ? 'REQUEST_REVIEW'
      : ['EXTERNAL_REPORT_PENDING', 'LEGACY_CODE_NO_MAPPING'].includes(issue.issue_type)
        ? 'ACCEPT_B'
        : 'ACCEPT_A'
    setDecision(initialDecision)
    setSelectedSource(initialDecision === 'ACCEPT_A'
      ? issue.source_a ?? ''
      : initialDecision === 'ACCEPT_B' ? issue.source_b ?? '' : '')
    setSelectedValue(initialDecision === 'ACCEPT_A'
      ? issue.value_a ?? ''
      : initialDecision === 'ACCEPT_B' ? issue.value_b ?? '' : '')
    setMappedTestId('')
    setReason('')
    setSaveError(null)
  }

  const onDecisionChange = (nextDecision: Decision) => {
    setDecision(nextDecision)
    if (nextDecision === 'ACCEPT_A') {
      setSelectedSource(selected?.source_a ?? '')
      setSelectedValue(selected?.value_a ?? '')
    } else if (nextDecision === 'ACCEPT_B') {
      setSelectedSource(selected?.source_b ?? '')
      setSelectedValue(selected?.value_b ?? '')
    } else if (nextDecision === 'MANUAL') {
      setSelectedSource('Manual')
      setSelectedValue('')
    } else {
      setSelectedSource('')
      setSelectedValue('')
    }
  }

  const handleResolve = async () => {
    if (!selected) return
    if (!reason.trim()) {
      setSaveError('El motivo es obligatorio.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const status = await resolveIssue(
        selected.id,
        decision,
        reason,
        selectedSource || null,
        selectedValue || null,
        mappedTestId || null,
      )
      setSelected(null)
      setReason('')
      await load()
      if (status === 'OPEN') {
        setNotice('La decisión quedó registrada y la inconsistencia permanece abierta para revisión.')
      } else {
        setNotice('La decisión quedó registrada, con auditoría y motivo.')
      }
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'No se pudo registrar la decisión.')
    } finally {
      setSaving(false)
    }
  }

  const handleDetection = async () => {
    if (!filterSampleId) {
      setLoadError('Seleccione una muestra antes de actualizar su detección.')
      return
    }
    setDetecting(true)
    setLoadError(null)
    try {
      const count = await detectReconciliationIssues(filterSampleId)
      await load()
      setNotice(`Detección finalizada. Se registraron ${count} inconsistencias nuevas; no se modificó ningún dato automáticamente.`)
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'No se pudieron detectar inconsistencias.')
    } finally {
      setDetecting(false)
    }
  }

  const columns: DataTableColumn<ReconciliationIssue>[] = [
    { key: 'sample', header: 'Muestra', render: sampleCode },
    { key: 'type', header: 'Inconsistencia', render: (issue) => issueTypeLabels[issue.issue_type] },
    { key: 'reception', header: 'Recepción', render: (issue) => `${issue.source_a ?? '—'}: ${issue.value_a ?? '—'}` },
    { key: 'catalog', header: 'Catálogo', render: (issue) => `${issue.source_c ?? '—'}: ${issue.value_c ?? '—'}` },
    { key: 'external', header: 'Fuente externa', render: (issue) => `${issue.source_b ?? '—'}: ${issue.value_b ?? '—'}` },
    {
      key: 'status',
      header: 'Estado',
      render: (issue) => <StatusBadge label={issue.status === 'OPEN' ? 'Abierta' : 'Resuelta'} tone={issue.status === 'OPEN' ? 'warning' : 'success'} />,
    },
    {
      key: 'demo',
      header: 'Origen',
      render: (issue) => issue.is_demo ? <StatusBadge label="DEMO" tone="info" /> : 'Operativo',
    },
    {
      key: 'action',
      header: 'Acción',
      render: (issue) => issue.status === 'OPEN' && canRequestReview && !issue.is_demo
        ? <button className="catalog-file-button" onClick={() => beginDecision(issue)} type="button">Revisar</button>
        : issue.is_demo ? 'Solo demostración' : '—',
    },
  ]

  const canSubmit = !!reason.trim() && !saving &&
    (decision === 'REQUEST_REVIEW' || !!selectedValue.trim()) &&
    (decision !== 'REQUEST_REVIEW' || canRequestReview) &&
    (decision === 'REQUEST_REVIEW' || canResolve)
  const needsTestMapping = selected?.issue_type === 'UNREQUESTED_PARAMETER' ||
    selected?.issue_type === 'LEGACY_CODE_NO_MAPPING'
  const mappingRequired = needsTestMapping &&
    (selected?.issue_type === 'LEGACY_CODE_NO_MAPPING'
      ? decision !== 'REQUEST_REVIEW'
      : decision !== 'REQUEST_REVIEW' && decision !== 'ACCEPT_B')

  return (
    <div>
      <PageHeader
        title="Conciliación de inconsistencias"
        description="Compara recepción, catálogo y fuente externa. Las decisiones se registran con motivo; ningún dato se cambia en silencio."
      />

      <div className="filter-bar reconciliation-filters">
        <label className="filter-field">
          <span>Muestra</span>
          <select value={filterSampleId} onChange={(event) => setFilterSampleId(event.target.value)}>
            <option value="">Todas las muestras</option>
            {options?.samples.map((sample) => <option key={sample.id} value={sample.id}>{sample.code}</option>)}
          </select>
        </label>
        <label className="filter-field">
          <span>Tipo de inconsistencia</span>
          <select value={filterType} onChange={(event) => setFilterType(event.target.value as IssueType | 'all')}>
            <option value="all">Todos los tipos</option>
            {Object.entries(issueTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="filter-field">
          <span>Estado</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="OPEN">Abiertas</option>
            <option value="RESOLVED">Resueltas</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <label className="reconciliation-demo-toggle">
          <input checked={showDemo} onChange={(event) => setShowDemo(event.target.checked)} type="checkbox" />
          Incluir datos DEMO
        </label>
        {canResolve && (
          <button className="catalog-file-button" disabled={!filterSampleId || detecting} onClick={() => void handleDetection()} type="button">
            {detecting ? 'Detectando…' : 'Detectar inconsistencias'}
          </button>
        )}
      </div>

      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {loadError && <ErrorState title="Aviso" message={loadError} />}
      {loading ? <LoadingState message="Cargando inconsistencias…" /> :
        !filtered.length
          ? <EmptyState title="Sin inconsistencias" description={showDemo ? 'No hay registros con estos filtros.' : 'No hay inconsistencias operativas. Los datos DEMO están ocultos.'} />
          : <DataTable caption="Inconsistencias de conciliación" columns={columns} rows={filtered} rowKey={(issue) => issue.id} />}

      {selected && (
        <Modal
          open
          title={`${issueTypeLabels[selected.issue_type]} · ${sampleCode(selected)}`}
          onClose={() => !saving && setSelected(null)}
        >
          <div className="reconciliation-modal">
            {selected.is_demo && <p className="catalog-notice">Caso de demostración DEMO. No corresponde a un dato operativo.</p>}
            <div className="side-by-side reconciliation-comparison">
              <section>
                <strong>{selected.source_a ?? 'Recepción'}</strong>
                <p>{selected.value_a ?? '—'}</p>
              </section>
              <section>
                <strong>{selected.source_c ?? 'Catálogo'}</strong>
                <p>{selected.value_c ?? '—'}</p>
              </section>
              <section>
                <strong>{selected.source_b ?? 'Fuente externa'}</strong>
                <p>{selected.value_b ?? '—'}</p>
              </section>
            </div>
            {selected.field_name && <p><strong>Campo:</strong> {selected.field_name}</p>}
            {selected.source_page && <p><strong>Página del informe:</strong> {selected.source_page}</p>}
            {selected.storage_path && (
              <section className="reconciliation-evidence">
                <h3>Archivo de origen</h3>
                {evidenceError && <ErrorState title="No se pudo abrir el archivo" message={evidenceError} />}
                {evidenceUrl && <iframe title="Archivo fuente de conciliación" src={evidenceUrl} />}
                {!evidenceUrl && !evidenceError && <LoadingState message="Preparando acceso seguro al archivo…" />}
              </section>
            )}
            {(selected.issue_type === 'MISSING_RESULT' || selected.issue_type === 'EXTERNAL_REPORT_PENDING') && (
              <p>
                Esta inconsistencia se cierra al completar el flujo relacionado, no al aceptarla sin evidencia:{' '}
                <Link to={selected.issue_type === 'MISSING_RESULT' ? '/resultados/carga' : '/laboratorios-externos'}>
                  {selected.issue_type === 'MISSING_RESULT' ? 'cargar el resultado' : 'recibir el reporte externo'}
                </Link>.
              </p>
            )}

            {saveError && <ErrorState title="No se pudo registrar la decisión" message={saveError} />}
            {canRequestReview ? (
              <div className="reconciliation-decision-form">
                <label>
                  Acción
                  <select value={decision} onChange={(event) => onDecisionChange(event.target.value as Decision)}>
                    {canResolve && selected.issue_type !== 'EXTERNAL_REPORT_PENDING' && <option value="ACCEPT_A">{selected.issue_type === 'UNREQUESTED_PARAMETER' ? 'Agregar al alcance (Fuente A)' : selected.issue_type === 'MISSING_RESULT' ? 'Confirmar que el resultado fue cargado' : `Aceptar ${selected.source_a ?? 'Fuente A'}`}</option>}
                    {canResolve && <option value="ACCEPT_B">{selected.issue_type === 'UNREQUESTED_PARAMETER' ? 'Rechazar parámetro (Fuente B)' : selected.issue_type === 'EXTERNAL_REPORT_PENDING' ? 'Confirmar recepción o cancelación' : `Aceptar ${selected.source_b ?? 'Fuente B'}`}</option>}
                    {canResolve && <option value="MANUAL">Corrección manual</option>}
                    <option value="REQUEST_REVIEW">{roles.some((role) => role.code === 'JEFE_TECNICA_CALIDAD') ? 'Devolver para revisión' : 'Solicitar revisión'}</option>
                  </select>
                </label>
                {decision === 'MANUAL' && (
                  <label>
                    Valor manual
                    <input onChange={(event) => setSelectedValue(event.target.value)} value={selectedValue} />
                  </label>
                )}
                {mappingRequired && (
                  <label>
                    Ensayo SA vigente
                    <select value={mappedTestId} onChange={(event) => setMappedTestId(event.target.value)}>
                      <option value="">Seleccione ensayo</option>
                      {options?.tests.map((test) => <option key={test.id} value={test.id}>{test.code} · {test.parameter_name ?? ''}</option>)}
                    </select>
                    {selected.issue_type === 'LEGACY_CODE_NO_MAPPING' && <small>Solo se aceptará si el ensayo SA tiene ficha técnica completa.</small>}
                  </label>
                )}
                <label>
                  Motivo obligatorio
                  <textarea onChange={(event) => setReason(event.target.value)} rows={3} value={reason} />
                </label>
                <div className="modal-actions">
                  <button className="catalog-primary-button" disabled={!canSubmit || (mappingRequired && !mappedTestId)} onClick={() => void handleResolve()} type="button">
                    {saving ? 'Guardando…' : decision === 'REQUEST_REVIEW' ? 'Registrar solicitud de revisión' : 'Confirmar decisión'}
                  </button>
                  <button className="catalog-file-button" disabled={saving} onClick={() => setSelected(null)} type="button">Cancelar</button>
                </div>
                {selected.decisions?.length ? (
                  <section className="reconciliation-decision-history">
                    <h3>Historial de decisiones</h3>
                    <ul>
                      {selected.decisions.map((item) => (
                        <li key={item.id}>
                          {item.decision} · {item.selected_source ?? 'Sin fuente'} · {item.selected_value ?? 'Sin valor'} · Motivo: {item.reason}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : <p>Solo lectura. ANALISTA y ADMIN pueden resolver; JEFE_TECNICA_CALIDAD puede devolver para revisión.</p>}
            <p className="muted">Creada: {formatDateTime(selected.created_at, {}, false)}</p>
            {isResultIssue(selected) && <p>Los cambios a resultados quedan registrados en el historial de correcciones; el texto original no se sobrescribe.</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
