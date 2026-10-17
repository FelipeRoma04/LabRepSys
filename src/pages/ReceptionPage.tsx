import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import {
  getQuoteDetail,
  listClients,
  listSelectableQuotes,
} from '../services/commercial'
import {
  getSample,
  getSampleOptions,
  listSamples,
  saveSample,
} from '../services/samples'
import type { Quote, QuoteDetail, Client } from '../types/commercial'
import type {
  Sample,
  SampleCatalogOptions,
  SamplePayload,
  SampleTest,
} from '../types/samples'

const stepTitles = [
  'Identificación',
  'Cliente y cotización',
  'Muestreo y recepción',
  'Preservación y recipientes',
  'Ensayos solicitados',
  'Asignación de laboratorio',
  'Cadena de custodia',
  'Revisión de la solicitud',
  'Revisión y guardado',
]
const localDateTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
const isoDateTime = (value: string) => value ? new Date(value).toISOString() : null
const nullable = (value: string | null | undefined) => value?.trim() || null

function initialPayload(): SamplePayload {
  return {
    code: '',
    client_id: '',
    quote_id: null,
    quote_suggestions_confirmed: false,
    suggested_regulations: [],
    matrix_id: null,
    plan_code: '',
    sampling_point: '',
    sampled_at: null,
    received_at: localDateTime(new Date().toISOString()),
    observations: '',
    containers: [{ type: '', quantity: '' }],
    preservation: { refrigeration: '', freezing: '', pH: '', level: '', other: '' },
    reception: {
      chain_of_custody_verified: false,
      arrival_conditions: '',
      has_deviation: false,
      deviations: '',
      client_consulted_on_deviation: false,
      signature_reference: '',
    },
    request_review: {
      capacity_verified: false,
      methods_verified: false,
      conformity_requested: false,
      decision_rule: null,
    },
    tests: [],
  }
}

function quoteTestToSampleTest(
  testId: string,
  suggestedLaboratoryId: string | null,
): SampleTest {
  return {
    test_id: testId,
    execution_type: 'SA',
    assigned_laboratory_id: suggestedLaboratoryId,
  }
}

function isContainerArray(value: unknown): value is { type: string; quantity: string }[] {
  return Array.isArray(value) && value.every((item) =>
    typeof item === 'object' && item !== null &&
    'type' in item && 'quantity' in item,
  )
}

export function ReceptionPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const editingId = searchParams.get('edit')
  const [step, setStep] = useState(0)
  const [payload, setPayload] = useState<SamplePayload>(initialPayload)
  const [reason, setReason] = useState('')
  const [options, setOptions] = useState<SampleCatalogOptions | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [quoteDetail, setQuoteDetail] = useState<QuoteDetail | null>(null)
  const [existingSample, setExistingSample] = useState<Sample | null>(null)
  const [samples, setSamples] = useState<Sample[]>([])
  const [today] = useState(() => {
    const date = new Date()
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
    return date.toISOString().slice(0, 10)
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sampleOptions, clientRows, quoteRows, sampleRows, sample] = await Promise.all([
        getSampleOptions(),
        listClients(),
        listSelectableQuotes(),
        listSamples(),
        editingId ? getSample(editingId) : Promise.resolve(null),
      ])
      setOptions(sampleOptions)
      setClients(clientRows.filter((client) => client.active))
      setQuotes(quoteRows)
      setSamples(sampleRows)
      if (sample) {
        const reception = sample.reception
        const review = reception?.request_review ?? {}
        const savedSuggestions = review.quote_suggestions
        const savedRegulations =
          typeof savedSuggestions === 'object' && savedSuggestions !== null &&
          'regulations' in savedSuggestions && Array.isArray(savedSuggestions.regulations)
            ? savedSuggestions.regulations
            : []
        setExistingSample(sample)
        setPayload({
          ...initialPayload(),
          code: sample.code,
          client_id: sample.client_id,
          quote_id: sample.quote_id,
          quote_suggestions_confirmed: Boolean(sample.quote_id),
          suggested_regulations: savedRegulations,
          matrix_id: sample.matrix_id,
          plan_code: sample.plan_code ?? '',
          sampling_point: sample.sampling_point ?? '',
          sampled_at: localDateTime(sample.sampled_at),
          received_at: localDateTime(sample.received_at),
          observations: sample.observations ?? '',
          containers: isContainerArray(reception?.containers) ? reception.containers : [],
          preservation: reception?.preservation ?? {},
          reception: {
            chain_of_custody_verified: reception?.chain_of_custody_verified ?? false,
            arrival_conditions: reception?.arrival_conditions ?? '',
            has_deviation: Boolean(reception?.deviations),
            deviations: reception?.deviations ?? '',
            client_consulted_on_deviation: reception?.client_consulted_on_deviation ?? false,
            signature_reference: reception?.signature_reference ?? '',
          },
          request_review: {
            capacity_verified: Boolean(review.capacity_verified),
            methods_verified: Boolean(review.methods_verified),
            conformity_requested: Boolean(review.conformity_requested),
            decision_rule: typeof review.decision_rule === 'string' ? review.decision_rule : null,
          },
          tests: (sample.tests ?? []).map((test) => ({
            test_id: test.test_id,
            execution_type: test.execution_type,
            assigned_laboratory_id: test.assigned_laboratory_id,
          })),
        })
        if (sample.quote_id) {
          setQuoteDetail(await getQuoteDetail(sample.quote_id))
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo preparar la recepción.')
    } finally {
      setLoading(false)
    }
  }, [editingId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const selectedQuote = quotes.find((quote) => quote.id === payload.quote_id) ?? null
  const selectedClient = clients.find((client) => client.id === payload.client_id) ?? null
  const compatibleQuotes = quotes.filter((quote) => quote.client_id === payload.client_id)
  const testLabels = useMemo(
    () => Object.fromEntries((options?.tests ?? []).map((test) => [
      test.id,
      `${test.code} · ${test.parameter_name ?? 'Parámetro sin nombre'}`,
    ])),
    [options],
  )
  const dateWarnings = useMemo(() => {
    const warnings: string[] = []
    const sampled = payload.sampled_at ? new Date(payload.sampled_at) : null
    const received = payload.received_at ? new Date(payload.received_at) : null
    if (sampled && Number.isFinite(sampled.getTime())) {
      if (sampled.toISOString().slice(0, 10) > today) warnings.push('La fecha de muestreo está en el futuro; verifique el dato.')
      if (received && Number.isFinite(received.getTime()) && sampled.getFullYear() !== received.getFullYear()) {
        warnings.push('El año de muestreo difiere del año de recepción; verifique posible error de digitación.')
      }
    }
    if (received && Number.isFinite(received.getTime()) && received.toISOString().slice(0, 10) > today) {
      warnings.push('La fecha de recepción está en el futuro; verifique el dato.')
    }
    return warnings
  }, [payload.received_at, payload.sampled_at, today])

  const update = <K extends keyof SamplePayload>(key: K, value: SamplePayload[K]) => {
    setPayload((current) => ({ ...current, [key]: value }))
  }
  const updateReception = <K extends keyof SamplePayload['reception']>(
    key: K,
    value: SamplePayload['reception'][K],
  ) => {
    setPayload((current) => ({
      ...current,
      reception: { ...current.reception, [key]: value },
    }))
  }
  const updateReview = <K extends keyof SamplePayload['request_review']>(
    key: K,
    value: SamplePayload['request_review'][K],
  ) => {
    setPayload((current) => ({
      ...current,
      request_review: { ...current.request_review, [key]: value },
    }))
  }

  const handleQuoteSelection = async (quoteId: string) => {
    update('quote_id', quoteId || null)
    update('quote_suggestions_confirmed', false)
    update('suggested_regulations', [])
    update('tests', [])
    setQuoteDetail(null)
    if (!quoteId) return
    try {
      const details = await getQuoteDetail(quoteId)
      setQuoteDetail(details)
      setPayload((current) => ({
        ...current,
        client_id: details.quote.client_id,
        quote_id: quoteId,
      }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las sugerencias.')
    }
  }

  const confirmQuoteSuggestions = () => {
    if (!quoteDetail) return
    setPayload((current) => ({
      ...current,
      quote_suggestions_confirmed: true,
      suggested_regulations: quoteDetail.regulations.map((regulation) => ({
        ...regulation,
        requires_confirmation: true,
      })),
      tests: quoteDetail.tests.map((test) =>
        quoteTestToSampleTest(test.test_id, test.suggested_laboratory_id),
      ),
    }))
  }

  const toggleTest = (testId: string, checked: boolean) => {
    setPayload((current) => ({
      ...current,
      tests: checked
        ? [...current.tests, { test_id: testId, execution_type: 'SA', assigned_laboratory_id: null }]
        : current.tests.filter((test) => test.test_id !== testId),
    }))
  }

  const validateStep = (targetStep: number): string | null => {
    if (targetStep === 1 && !options?.codePattern) return 'No se cargó el patrón de código configurado.'
    if (targetStep >= 1) {
      let pattern: RegExp
      try {
        pattern = new RegExp(options?.codePattern ?? '^AG[0-9]{4}$')
      } catch {
        return 'El patrón de código configurado no es una expresión regular válida.'
      }
      if (!pattern.test(payload.code.trim())) return 'El código de muestra no cumple el patrón configurado.'
      if (samples.some((sample) => sample.code === payload.code.trim() && sample.id !== editingId)) {
        return 'Ya existe una muestra con ese código.'
      }
    }
    if (targetStep >= 2 && !payload.client_id) return 'Seleccione un cliente.'
    if (targetStep >= 2 && payload.quote_id && !payload.quote_suggestions_confirmed) {
      return 'Revise y confirme expresamente las sugerencias de la cotización.'
    }
    if (targetStep >= 3 && !payload.matrix_id) return 'Seleccione una matriz.'
    if (targetStep >= 3 && (!payload.received_at || !Number.isFinite(new Date(payload.received_at).getTime()))) {
      return 'Ingrese una fecha de recepción válida.'
    }
    if (targetStep >= 5 && payload.tests.length === 0) return 'Seleccione al menos un ensayo solicitado.'
    if (targetStep >= 6 && payload.tests.some((test) =>
      test.execution_type === 'SUBCONTRACTED' && !test.assigned_laboratory_id,
    )) return 'Asigne un laboratorio a cada ensayo subcontratado.'
    if (targetStep >= 7 && payload.reception.has_deviation &&
      (!payload.reception.deviations?.trim() || !payload.reception.client_consulted_on_deviation)) {
      return 'Describa la desviación y registre la consulta al cliente antes de avanzar.'
    }
    if (targetStep >= 8 && (!payload.request_review.capacity_verified || !payload.request_review.methods_verified)) {
      return 'Registre la verificación de capacidad y métodos.'
    }
    if (targetStep >= 8 && payload.request_review.conformity_requested &&
      !payload.request_review.decision_rule?.trim()) {
      return 'Registre la regla de decisión acordada para la declaración de conformidad.'
    }
    return null
  }

  const goToStep = (nextStep: number) => {
    if (nextStep > step) {
      const validation = validateStep(nextStep)
      if (validation) {
        setError(validation)
        return
      }
    }
    setError(null)
    setStep(nextStep)
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validation = validateStep(8)
    if (validation) {
      setError(validation)
      return
    }
    if (editingId && !reason.trim()) {
      setError('Indique el motivo del cambio posterior a la recepción.')
      return
    }
    if (payload.quote_id && !payload.quote_suggestions_confirmed) {
      setError('Confirme explícitamente las sugerencias de la cotización.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const normalizedPayload: SamplePayload = {
        ...payload,
        code: payload.code.trim(),
        plan_code: nullable(payload.plan_code),
        sampling_point: nullable(payload.sampling_point),
        sampled_at: isoDateTime(payload.sampled_at ?? ''),
        received_at: isoDateTime(payload.received_at) ?? new Date().toISOString(),
        observations: nullable(payload.observations),
        containers: payload.containers.filter((container) => container.type.trim() || container.quantity.trim()),
        reception: {
          ...payload.reception,
          arrival_conditions: nullable(payload.reception.arrival_conditions),
          deviations: payload.reception.has_deviation ? nullable(payload.reception.deviations) : null,
          signature_reference: nullable(payload.reception.signature_reference),
        },
        request_review: {
          ...payload.request_review,
          decision_rule: payload.request_review.conformity_requested
            ? nullable(payload.request_review.decision_rule ?? '')
            : null,
        },
      }
      await saveSample(editingId, normalizedPayload, editingId ? reason.trim() : null)
      setNotice(editingId ? 'Cambios guardados y auditados.' : 'Muestra recibida correctamente.')
      navigate('/muestras/buscar', { replace: true, state: { notice: editingId ? 'Cambios guardados y auditados.' : 'Muestra recibida correctamente.' } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la recepción.')
    } finally {
      setSaving(false)
    }
  }

  const sampleIsIssuableWithLab = (testId: string, laboratoryId: string | null) => {
    if (!laboratoryId || !options) return false
    const today = new Date().toISOString().slice(0, 10)
    return options.accreditedScopes.some((scope) =>
      scope.test_id === testId &&
      scope.laboratory_id === laboratoryId &&
      scope.active &&
      (!scope.valid_from || scope.valid_from <= today) &&
      (!scope.valid_until || scope.valid_until >= today),
    )
  }

  if (loading) return <LoadingState message="Preparando recepción…" />
  if (!options) return <ErrorState title="No se pudo preparar la recepción" message={error ?? 'No hay opciones disponibles.'} />

  return (
    <>
      <PageHeader
        title={editingId ? `Editar recepción ${existingSample?.code ?? ''}` : 'Recepción de muestras'}
        description="Asistente de recepción en nueve pasos. Las sugerencias comerciales requieren confirmación."
      />
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {error && <ErrorState message={error} />}
      <ol aria-label="Pasos de recepción" className="wizard-steps">
        {stepTitles.map((title, index) => (
          <li aria-current={index === step ? 'step' : undefined} className={index === step ? 'active' : index < step ? 'complete' : ''} key={title}>
            <button disabled={index > step} onClick={() => goToStep(index)} type="button">
              <span>{index + 1}</span>{title}
            </button>
          </li>
        ))}
      </ol>

      <form className="reception-wizard" onSubmit={(event) => void save(event)}>
        <fieldset className="reception-step">
          <legend>{step + 1}. {stepTitles[step]}</legend>
          {step === 0 && (
            <div className="catalog-form">
              <label>Código de muestra
                <input onChange={(event) => update('code', event.target.value.toUpperCase())} required value={payload.code} />
              </label>
              <p className="catalog-form-note">Patrón configurado: <code>{options.codePattern}</code>. La validación se aplica también en la base de datos. Prefijos por matriz y reinicio anual siguen pendientes (DP-032).</p>
              <label>Código del plan<input onChange={(event) => update('plan_code', event.target.value)} value={payload.plan_code ?? ''} /></label>
            </div>
          )}
          {step === 1 && (
            <div className="catalog-form">
              <label>Cliente
                <select onChange={(event) => {
                  update('client_id', event.target.value)
                  update('quote_id', null)
                  setQuoteDetail(null)
                  update('quote_suggestions_confirmed', false)
                }} required value={payload.client_id}>
                  <option value="">Seleccionar cliente</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.business_name}{client.nit ? ` · ${client.nit}` : ''}</option>)}
                </select>
              </label>
              {selectedClient && <p>Cliente seleccionado: <strong>{selectedClient.business_name}</strong>{selectedClient.nit && ` · NIT ${selectedClient.nit}`}</p>}
              <label>Cotización vigente (opcional)
                <select onChange={(event) => void handleQuoteSelection(event.target.value)} value={payload.quote_id ?? ''}>
                  <option value="">Sin cotización</option>
                  {compatibleQuotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.code}</option>)}
                </select>
              </label>
              {selectedQuote && quoteDetail && (
                <section className="suggestion-panel" aria-label="Sugerencias desde cotización">
                  <h3>Sugerido desde cotización {selectedQuote.code}</h3>
                  <p>Cliente: {selectedClient?.business_name}</p>
                  <h4>Ensayos</h4>
                  <ul>{quoteDetail.tests.map((test) => <li key={test.id}>
                    {testLabels[test.test_id] ?? test.test_id}
                    {test.matrix_id ? ` · ${options.matrices.find((matrix) => matrix.id === test.matrix_id)?.name ?? 'matriz vinculada'}` : ''}
                  </li>)}</ul>
                  <h4>Normativa (pendiente de confirmación)</h4>
                  <ul>{quoteDetail.regulations.map((item) => <li key={item.id}>{item.regulation_name} · {item.article ?? 'sin artículo'} · {item.discharge_type}</li>)}</ul>
                  <p>Las sugerencias no se aplican ni se incorporan a la muestra hasta que confirmes explícitamente.</p>
                  <button className="catalog-primary-button" onClick={confirmQuoteSuggestions} type="button">
                    {payload.quote_suggestions_confirmed ? 'Sugerencias confirmadas' : 'Confirmar y aplicar sugerencias'}
                  </button>
                </section>
              )}
              {payload.quote_id && !quoteDetail && <p>La cotización se seleccionó pero no se pudieron cargar sus sugerencias.</p>}
            </div>
          )}
          {step === 2 && (
            <div className="catalog-form">
              <label>Matriz
                <select onChange={(event) => update('matrix_id', event.target.value || null)} required value={payload.matrix_id ?? ''}>
                  <option value="">Seleccionar matriz</option>
                  {options.matrices.map((matrix) => <option key={matrix.id} value={matrix.id}>{matrix.code} · {matrix.name}</option>)}
                </select>
              </label>
              <label>Punto de muestreo<input onChange={(event) => update('sampling_point', event.target.value)} value={payload.sampling_point ?? ''} /></label>
              <div className="commercial-date-fields">
                <label>Fecha y hora de muestreo<input onChange={(event) => update('sampled_at', event.target.value || null)} type="datetime-local" value={payload.sampled_at ?? ''} /></label>
                <label>Fecha y hora de recepción<input onChange={(event) => update('received_at', event.target.value)} required type="datetime-local" value={payload.received_at} /></label>
              </div>
              {dateWarnings.map((warning) => <p className="commercial-warning" key={warning} role="status">{warning}</p>)}
              <label>Observaciones<textarea onChange={(event) => update('observations', event.target.value)} value={payload.observations ?? ''} /></label>
            </div>
          )}
          {step === 3 && (
            <div className="catalog-form">
              <section className="commercial-fieldset">
                <h3>Recipientes</h3>
                {payload.containers.map((container, index) => (
                  <div className="commercial-date-fields" key={`container-${index}`}>
                    <label>Tipo o descripción<input onChange={(event) => update('containers', payload.containers.map((item, row) => row === index ? { ...item, type: event.target.value } : item))} value={container.type} /></label>
                    <label>Cantidad<input onChange={(event) => update('containers', payload.containers.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item))} value={container.quantity} /></label>
                    <button onClick={() => update('containers', payload.containers.filter((_, row) => row !== index))} type="button">Quitar</button>
                  </div>
                ))}
                <button onClick={() => update('containers', [...payload.containers, { type: '', quantity: '' }])} type="button">Agregar recipiente</button>
              </section>
              <section className="commercial-fieldset">
                <h3>Preservación</h3>
                {Object.entries(payload.preservation).map(([key, value]) => (
                  <label key={key}>{key === 'ph' ? 'pH' : key === 'other' ? 'Otros' : key.charAt(0).toUpperCase() + key.slice(1)}
                    <input onChange={(event) => update('preservation', { ...payload.preservation, [key]: event.target.value })} value={value} />
                  </label>
                ))}
              </section>
            </div>
          )}
          {step === 4 && (
            <div className="catalog-form">
              {!payload.quote_id && <p>La cotización no suministra ensayos; selecciona los parámetros manualmente.</p>}
              {options.tests.map((test) => (
                <label className="commercial-test-choice" key={test.id}>
                  <input checked={payload.tests.some((item) => item.test_id === test.id)} onChange={(event) => toggleTest(test.id, event.target.checked)} type="checkbox" />
                  <span>{test.code} · {test.parameter_name ?? 'Parámetro sin nombre'}</span>
                </label>
              ))}
              {payload.quote_id && !payload.quote_suggestions_confirmed && (
                <p className="commercial-warning">La cotización seleccionada requiere confirmar sugerencias en el paso 2.</p>
              )}
            </div>
          )}
          {step === 5 && (
            <div className="catalog-form">
              {payload.tests.map((test, index) => (
                <section className="commercial-test-row" key={`${test.test_id}-${index}`}>
                  <strong>{testLabels[test.test_id] ?? test.test_id}</strong>
                  <label>Tipo de ejecución
                    <select onChange={(event) => update('tests', payload.tests.map((item, row) => row === index ? {
                      ...item,
                      execution_type: event.target.value as SampleTest['execution_type'],
                      assigned_laboratory_id: event.target.value === 'SUBCONTRACTED' ? item.assigned_laboratory_id : null,
                    } : item))} value={test.execution_type}>
                      <option value="SA">SA</option>
                      <option value="SUBCONTRACTED">Subcontratado</option>
                    </select>
                  </label>
                  <label>Laboratorio asignado
                    <select onChange={(event) => update('tests', payload.tests.map((item, row) => row === index ? { ...item, assigned_laboratory_id: event.target.value || null } : item))} required={test.execution_type === 'SUBCONTRACTED'} value={test.assigned_laboratory_id ?? ''}>
                      <option value="">Sin asignar</option>
                      {options.laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.code} · {lab.name}</option>)}
                    </select>
                  </label>
                  {test.execution_type === 'SUBCONTRACTED' && test.assigned_laboratory_id && !sampleIsIssuableWithLab(test.test_id, test.assigned_laboratory_id) && (
                    <p className="commercial-warning">Advertencia: no se encontró alcance acreditado vigente para este ensayo y laboratorio. La asignación queda registrada para revisión.</p>
                  )}
                </section>
              ))}
            </div>
          )}
          {step === 6 && (
            <div className="catalog-form">
              <label className="commercial-test-choice"><input checked={payload.reception.chain_of_custody_verified} onChange={(event) => updateReception('chain_of_custody_verified', event.target.checked)} type="checkbox" />Cadena de custodia verificada</label>
              <label>Condiciones de llegada<textarea onChange={(event) => updateReception('arrival_conditions', event.target.value)} value={payload.reception.arrival_conditions ?? ''} /></label>
              <label className="commercial-test-choice"><input checked={payload.reception.has_deviation} onChange={(event) => updateReception('has_deviation', event.target.checked)} type="checkbox" />Se identificó una desviación</label>
              {payload.reception.has_deviation && <>
                <label>Desviación<textarea onChange={(event) => updateReception('deviations', event.target.value)} required value={payload.reception.deviations ?? ''} /></label>
                <label className="commercial-test-choice"><input checked={payload.reception.client_consulted_on_deviation} onChange={(event) => updateReception('client_consulted_on_deviation', event.target.checked)} type="checkbox" />Consulta al cliente realizada y documentada</label>
                <p className="catalog-form-note">La desviación no puede avanzar sin constancia de la consulta al cliente.</p>
              </>}
              <label>Referencia de firma (opcional)<input onChange={(event) => updateReception('signature_reference', event.target.value)} value={payload.reception.signature_reference ?? ''} /></label>
            </div>
          )}
          {step === 7 && (
            <div className="catalog-form">
              <label className="commercial-test-choice"><input checked={payload.request_review.capacity_verified} onChange={(event) => updateReview('capacity_verified', event.target.checked)} type="checkbox" />Verificación de capacidad registrada</label>
              <label className="commercial-test-choice"><input checked={payload.request_review.methods_verified} onChange={(event) => updateReview('methods_verified', event.target.checked)} type="checkbox" />Verificación de métodos registrada</label>
              <label className="commercial-test-choice"><input checked={payload.request_review.conformity_requested} onChange={(event) => updateReview('conformity_requested', event.target.checked)} type="checkbox" />El cliente solicita declaración de conformidad</label>
              {payload.request_review.conformity_requested && (
                <label>Regla de decisión acordada<textarea onChange={(event) => updateReview('decision_rule', event.target.value)} required value={payload.request_review.decision_rule ?? ''} /></label>
              )}
              {quoteDetail?.quote.decision_rule && (
                <p className="suggestion-panel">Regla de decisión sugerida desde la cotización: {quoteDetail.quote.decision_rule}. Verifica y confirma la regla aplicable.</p>
              )}
            </div>
          )}
          {step === 8 && (
            <div className="catalog-form">
              <dl className="catalog-detail">
                <div><dt>Código</dt><dd>{payload.code}</dd></div>
                <div><dt>Cliente</dt><dd>{selectedClient?.business_name ?? '—'}</dd></div>
                <div><dt>Cotización</dt><dd>{selectedQuote?.code ?? 'Sin cotización'}</dd></div>
                <div><dt>Matriz</dt><dd>{options.matrices.find((matrix) => matrix.id === payload.matrix_id)?.name ?? '—'}</dd></div>
                <div><dt>Ensayos</dt><dd>{payload.tests.map((test) => testLabels[test.test_id] ?? test.test_id).join('; ')}</dd></div>
                <div><dt>Recepción</dt><dd>{payload.received_at}</dd></div>
                <div><dt>Consulta de desviación</dt><dd>{payload.reception.has_deviation ? payload.reception.client_consulted_on_deviation ? 'Registrada' : 'Pendiente' : 'No aplica'}</dd></div>
              </dl>
              {editingId && <label>Motivo del cambio posterior a recepción
                <textarea onChange={(event) => setReason(event.target.value)} required value={reason} />
              </label>}
              {dateWarnings.map((warning) => <p className="commercial-warning" key={warning}>{warning}</p>)}
              <p className="catalog-form-note">Al guardar, se conserva una sugerencia normativa desde cotización que deberá confirmarse en la etapa correspondiente.</p>
              <button className="catalog-primary-button" disabled={saving} type="submit">{saving ? 'Guardando…' : editingId ? 'Guardar cambios auditados' : 'Guardar recepción'}</button>
            </div>
          )}
        </fieldset>
        <div className="catalog-form-actions">
          <button disabled={step === 0 || saving} onClick={() => goToStep(step - 1)} type="button">Anterior</button>
          {step < stepTitles.length - 1 && <button className="catalog-primary-button" disabled={saving} onClick={() => goToStep(step + 1)} type="button">Siguiente</button>}
          <button disabled={saving} onClick={() => navigate('/muestras/buscar')} type="button">Cancelar</button>
        </div>
      </form>
    </>
  )
}
