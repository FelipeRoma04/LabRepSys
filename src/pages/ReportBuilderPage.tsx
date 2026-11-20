import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../hooks/useAuth'
import { getReport } from '../services/reports'
import type { Report } from '../types/reports'
import {
  getReportBuilderOptions,
  getReportComposition,
  saveReportDraft,
  type ReportBuilderOptions,
} from '../services/reportBuilder'

const emptyOptions: ReportBuilderOptions = {
  samples: [],
  results: [],
  regulations: [],
  clients: [],
  contacts: [],
  templates: [],
}

export function ReportBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, roles } = useAuth()
  const canCreate = roles.some((role) => role.code === 'ANALISTA')
  const [report, setReport] = useState<Report | null>(null)
  const [options, setOptions] = useState<ReportBuilderOptions>(emptyOptions)
  const [clientId, setClientId] = useState('')
  const [contactId, setContactId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [sampleIds, setSampleIds] = useState<string[]>([])
  const [resultIds, setResultIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [builderOptions, currentReport] = await Promise.all([
        getReportBuilderOptions(),
        id ? getReport(id) : Promise.resolve(null),
      ])
      setOptions(builderOptions)
      setReport(currentReport)
      if (currentReport && id) {
        const composition = await getReportComposition(id)
        setClientId(currentReport.client_id ?? '')
        setContactId(currentReport.contact_id ?? '')
        setTemplateId(currentReport.template_id ?? '')
        setSampleIds(composition.samples.flatMap((entry) => entry.sample ? [entry.sample.id] : []))
        setResultIds(composition.results.flatMap((entry) => entry.result ? [entry.result.id] : []))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el constructor del reporte.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const selectedSamples = useMemo(
    () => options.samples.filter((sample) => sampleIds.includes(sample.id)),
    [options.samples, sampleIds],
  )
  const selectedResults = useMemo(
    () => options.results.filter((result) => resultIds.includes(result.id) && sampleIds.includes(result.sample_id)),
    [options.results, resultIds, sampleIds],
  )
  const selectableResults = useMemo(
    () => options.results.filter((result) => sampleIds.includes(result.sample_id)),
    [options.results, sampleIds],
  )
  const distinctClients = new Set(selectedSamples.map((sample) => sample.client_id))
  const eligibleContacts = options.contacts.filter((contact) => contact.client_id === clientId)
  const canEdit = canCreate && (!report || (
    report.prepared_by === profile?.id && ['DRAFT', 'RETURNED'].includes(report.status)
  ))

  const toggleSample = (sampleId: string, checked: boolean) => {
    const sample = options.samples.find((candidate) => candidate.id === sampleId)
    setSampleIds((current) => checked
      ? [...new Set([...current, sampleId])]
      : current.filter((value) => value !== sampleId))
    if (checked) {
      if (sample) setClientId((current) => current || sample.client_id)
      const newResultIds = options.results
        .filter((result) => result.sample_id === sampleId)
        .map((result) => result.id)
      setResultIds((current) => [...new Set([...current, ...newResultIds])])
    } else {
      if (sample?.client_id === clientId) {
        const remainingSample = options.samples.find((candidate) =>
          candidate.id !== sampleId && sampleIds.includes(candidate.id),
        )
        setClientId(remainingSample?.client_id ?? '')
        setContactId('')
      }
      const removedResultIds = new Set(options.results
        .filter((result) => result.sample_id === sampleId)
        .map((result) => result.id))
      setResultIds((current) => current.filter((value) => !removedResultIds.has(value)))
    }
  }

  const toggleResult = (resultId: string, checked: boolean) => {
    setResultIds((current) => checked
      ? [...new Set([...current, resultId])]
      : current.filter((value) => value !== resultId))
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!sampleIds.length) {
      setError('Seleccione al menos una muestra para el borrador.')
      return
    }
    if (distinctClients.size > 1) {
      setError('Las muestras pertenecen a distintos clientes. La agrupación entre clientes está pendiente de decisión (DP-003); cree reportes separados.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const reportId = await saveReportDraft({
        reportId: id ?? null,
        clientId: clientId || null,
        contactId: contactId || null,
        templateId: templateId || null,
        sampleIds,
        resultIds: selectedResults.map((result) => result.id),
      })
      navigate(`/reportes/${reportId}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el borrador.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState message="Cargando datos para el reporte…" />
  if (error && options.samples.length === 0) return <ErrorState title="Error al cargar" message={error} />
  if (!canEdit) return <EmptyState title="Sin permiso para editar" description="Solo el analista responsable puede editar su borrador o reporte devuelto." />
  if (report && !['DRAFT', 'RETURNED'].includes(report.status)) {
    return <EmptyState title="Reporte de solo lectura" description="Este reporte ya no está en estado editable." />
  }

  return (
    <div>
      <PageHeader
        title={id ? 'Editar borrador RSA' : 'Nuevo borrador RSA'}
        description="Seleccione muestras, resultados y una plantilla aprobada. Guardar conserva el reporte en estado de borrador."
      />
      {error && <ErrorState title="No se pudo guardar" message={error} />}
      {distinctClients.size > 1 && (
        <p className="notice notice-warning" role="status">
          Las muestras seleccionadas pertenecen a distintos clientes. La regla de agrupación está pendiente (DP-003); no se permitirá guardar esta combinación.
        </p>
      )}
      <form className="catalog-form" onSubmit={(event) => void handleSave(event)}>
        <div className="form-grid">
          <label>
            Cliente
            <select value={clientId} onChange={(event) => { setClientId(event.target.value); setContactId('') }}>
              <option value="">Seleccione un cliente</option>
              {options.clients.map((client) => <option key={client.id} value={client.id}>{client.business_name}</option>)}
            </select>
          </label>
          <label>
            Contacto
            <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">Sin contacto</option>
              {eligibleContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
            </select>
          </label>
          <label>
            Plantilla aprobada
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              <option value="">Seleccione una plantilla</option>
              {options.templates.map((template) => (
                <option key={template.id} value={template.id}>{template.code} · v{template.version}</option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend>Muestras</legend>
          {options.samples.length === 0
            ? <EmptyState title="No hay muestras disponibles" description="Las muestras disponibles según sus permisos aparecerán aquí." />
            : options.samples.map((sample) => (
              <label className="check-row" key={sample.id}>
                <input
                  checked={sampleIds.includes(sample.id)}
                  onChange={(event) => toggleSample(sample.id, event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>{sample.code}</strong> · {sample.client?.business_name ?? 'Cliente no disponible'}
                  {' · '}{sample.matrix?.name ?? 'Matriz no disponible'}
                  {' · Muestreo: '}{sample.sampled_at ? new Date(sample.sampled_at).toLocaleDateString('es-CO') : 'No registrado'}
                  {sample.sampling_point ? ` · ${sample.sampling_point}` : ''}
                </span>
              </label>
            ))}
        </fieldset>

        {selectedSamples.map((sample) => {
          const sampleResults = selectableResults.filter((result) => result.sample_id === sample.id)
          const sampleRegulations = options.regulations.filter((regulation) => regulation.sample_id === sample.id)
          return (
            <fieldset key={sample.id}>
              <legend>Resultados · {sample.code}</legend>
              {sampleRegulations.length > 0 && (
                <section>
                  <h3>Normativa y límites confirmados</h3>
                  {sampleRegulations.map((regulation) => (
                    <div key={regulation.id}>
                      <strong>{regulation.version?.regulation?.code ?? 'Norma'} · {regulation.version?.regulation?.name ?? 'Sin nombre'}</strong>
                      <span> · {regulation.version?.activity?.article ?? 'Artículo no registrado'} · {regulation.version?.activity?.activity ?? 'Actividad no registrada'}</span>
                      <ul>
                        {(regulation.version?.activity?.limits ?? [])
                          .filter((limit) => sampleResults.some((result) => result.test_id === limit.test_id))
                          .map((limit) => (
                            <li key={`${regulation.id}-${limit.test_id}`}>
                              Límite: {limit.limit_text ?? (`${limit.limit_operator ?? ''} ${limit.limit_value ?? ''}`.trim() || limit.special_value || 'No especificado')}
                              {limit.unit ? ` ${limit.unit}` : ''}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </section>
              )}
              {sampleResults.length === 0
                ? <p>No hay resultados disponibles para esta muestra.</p>
                : sampleResults.map((result) => (
                  <label className="check-row" key={result.id}>
                    <input
                      checked={resultIds.includes(result.id)}
                      onChange={(event) => toggleResult(result.id, event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>{result.test?.code ?? 'Ensayo sin código'}</strong>
                      {' · '}{result.test?.parameter_name ?? 'Parámetro no especificado'}
                      {' · Resultado: '}{result.original_text ?? result.reported_text ?? (result.numeric_value === null ? 'Sin dato' : String(result.numeric_value))}
                      {' · Unidad: '}{result.unit ?? 'No especificada'}
                      {' · Método: '}{result.method_text ?? 'No especificado'}
                      {' · Técnica: '}{result.technique_text ?? 'No especificada'}
                      {' · LCM: '}{result.lcm ?? 'No especificado'}
                      {' · Incertidumbre: '}{result.uncertainty_text ?? 'No especificada'}
                      {' · Clasificación: '}{result.execution_type === 'SUBCONTRACTED'
                        ? 'Subcontratado'
                        : result.accreditation_type === 'ACCREDITED'
                          ? 'SA acreditado'
                          : result.accreditation_type === 'NOT_ACCREDITED'
                            ? 'SA no acreditado'
                            : result.execution_type ?? 'No especificada'}
                      {result.accreditation_type ? ` · Acreditación: ${result.accreditation_type}` : ''}
                      {' · Laboratorio: '}{result.assigned_laboratory?.name ?? result.laboratory?.name ?? 'No especificado'}
                    </span>
                  </label>
                ))}
            </fieldset>
          )
        })}
        {selectedSamples.some((sample) => sample.observations) && (
          <section>
            <h2>Observaciones de las muestras</h2>
            {selectedSamples.filter((sample) => sample.observations).map((sample) => (
              <p key={sample.id}><strong>{sample.code}:</strong> {sample.observations}</p>
            ))}
          </section>
        )}
        <p>{selectedSamples.length} muestra(s) · {selectedResults.length} resultado(s) seleccionado(s).</p>
        <div className="catalog-form-actions">
          <button className="btn btn-secondary" onClick={() => navigate(-1)} type="button">Cancelar</button>
          <button className="btn btn-primary" disabled={saving || !sampleIds.length} type="submit">
            {saving ? 'Guardando…' : 'Guardar borrador'}
          </button>
        </div>
      </form>
    </div>
  )
}
