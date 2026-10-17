import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import {
  getQuoteDetail,
  listClients,
  listContacts,
  listQuoteOptions,
  listQuotes,
  saveQuote,
  setQuoteStatus,
  type QuotePayload,
} from '../services/commercial'
import type {
  Client,
  Contact,
  Quote,
  QuoteDetail,
  QuoteRegulation,
  QuoteTest,
  QuoteStatus,
} from '../types/commercial'

type QuoteFormValues = {
  client_id: string
  contact_id: string
  quote_date: string
  valid_until: string
  decision_rule: string
  observations: string
}

type RegulationForm = {
  regulation_name: string
  article: string
  activity: string
  discharge_type: 'ARD' | 'ARnD' | 'NA'
  decision_rule: string
}

const statusLabels: Record<QuoteStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Vigente',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
}
const statusTones: Record<QuoteStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  EXPIRED: 'warning',
  CANCELLED: 'danger',
}
const emptyRegulation: RegulationForm = {
  regulation_name: '',
  article: '',
  activity: '',
  discharge_type: 'NA',
  decision_rule: '',
}

function localToday() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function optional(value: string): string | null {
  return value.trim() || null
}

function mapRegulation(row: QuoteRegulation): RegulationForm {
  return {
    regulation_name: row.regulation_name,
    article: row.article ?? '',
    activity: row.activity ?? '',
    discharge_type: row.discharge_type,
    decision_rule: row.decision_rule ?? '',
  }
}

export function QuotesPage() {
  const { roles } = useAuth()
  const canManage = roles.some((role) => ['ADMIN', 'COMERCIAL'].includes(role.code))
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [options, setOptions] = useState<Awaited<ReturnType<typeof listQuoteOptions>> | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'ALL'>('ALL')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null)
  const [formValues, setFormValues] = useState<QuoteFormValues>({
    client_id: '',
    contact_id: '',
    quote_date: localToday(),
    valid_until: '',
    decision_rule: '',
    observations: '',
  })
  const [selectedTests, setSelectedTests] = useState<QuoteTest[]>([])
  const [regulations, setRegulations] = useState<RegulationForm[]>([])
  const [detail, setDetail] = useState<QuoteDetail | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [quoteRows, clientRows, contactRows, quoteOptions] = await Promise.all([
        listQuotes(),
        listClients(),
        listContacts(),
        listQuoteOptions(),
      ])
      setQuotes(quoteRows)
      setClients(clientRows)
      setContacts(contactRows)
      setOptions(quoteOptions)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las cotizaciones.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  const clientLabels = useMemo(
    () => Object.fromEntries(clients.map((client) => [client.id, client.business_name])),
    [clients],
  )
  const filteredQuotes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return quotes.filter((quote) => {
      if (statusFilter !== 'ALL' && quote.status !== statusFilter) return false
      return !term || quote.code.toLocaleLowerCase().includes(term) ||
        clientLabels[quote.client_id]?.toLocaleLowerCase().includes(term)
    })
  }, [clientLabels, quotes, search, statusFilter])
  const clientContacts = contacts.filter(
    (contact) => contact.client_id === formValues.client_id && contact.active,
  )

  const openCreate = () => {
    setEditingQuote(null)
    setFormValues({
      client_id: '',
      contact_id: '',
      quote_date: localToday(),
      valid_until: '',
      decision_rule: '',
      observations: '',
    })
    setSelectedTests([])
    setRegulations([])
    setFormOpen(true)
  }

  const openEdit = async (quote: Quote) => {
    setError(null)
    try {
      const quoteDetail = await getQuoteDetail(quote.id)
      setEditingQuote(quote)
      setFormValues({
        client_id: quote.client_id,
        contact_id: quote.contact_id ?? '',
        quote_date: quote.quote_date,
        valid_until: quote.valid_until ?? '',
        decision_rule: quote.decision_rule ?? '',
        observations: quote.observations ?? '',
      })
      setSelectedTests(quoteDetail.tests.map((item) => ({
        test_id: item.test_id,
        matrix_id: item.matrix_id,
        suggested_laboratory_id: item.suggested_laboratory_id,
        notes: item.notes,
      })))
      setRegulations(quoteDetail.regulations.map(mapRegulation))
      setFormOpen(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la cotización.')
    }
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      if (!selectedTests.length) {
        throw new Error('Agrega al menos un ensayo solicitado.')
      }
      const payload: QuotePayload = {
        client_id: formValues.client_id,
        contact_id: formValues.contact_id || null,
        quote_date: formValues.quote_date,
        valid_until: formValues.valid_until || null,
        decision_rule: optional(formValues.decision_rule),
        observations: optional(formValues.observations),
        tests: selectedTests,
        regulations: regulations
          .filter((regulation) => regulation.regulation_name.trim())
          .map((regulation) => ({
            ...regulation,
            regulation_name: regulation.regulation_name.trim(),
            article: optional(regulation.article),
            activity: optional(regulation.activity),
            decision_rule: optional(regulation.decision_rule),
            requires_confirmation: true,
          })),
      }
      await saveQuote(editingQuote?.id ?? null, payload)
      setFormOpen(false)
      setNotice(editingQuote ? 'Cotización actualizada.' : 'Cotización creada como borrador.')
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la cotización.')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (quote: Quote, status: QuoteStatus) => {
    setError(null)
    setNotice(null)
    try {
      await setQuoteStatus(quote.id, status)
      setNotice(`Cotización ${quote.code}: estado ${statusLabels[status].toLocaleLowerCase()}.`)
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado.')
    }
  }

  const openDetail = async (quote: Quote) => {
    setError(null)
    try {
      setDetail(await getQuoteDetail(quote.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el detalle.')
    }
  }

  const columns: DataTableColumn<Quote>[] = [
    { key: 'code', header: 'Código', render: (quote) => quote.code },
    { key: 'client', header: 'Cliente', render: (quote) => clientLabels[quote.client_id] ?? '—' },
    { key: 'quote_date', header: 'Fecha', render: (quote) => quote.quote_date },
    { key: 'valid_until', header: 'Vigencia', render: (quote) => quote.valid_until ?? 'Sin fecha límite' },
    {
      key: 'status',
      header: 'Estado',
      render: (quote) => <StatusBadge label={statusLabels[quote.status]} tone={statusTones[quote.status]} />,
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (quote) => (
        <div className="catalog-row-actions">
          <button onClick={() => void openDetail(quote)} type="button">Detalle</button>
          {canManage && <>
            <button onClick={() => void openEdit(quote)} type="button">Editar</button>
            <select
              aria-label={`Estado de ${quote.code}`}
              onChange={(event) => void changeStatus(quote, event.target.value as QuoteStatus)}
              value={quote.status}
            >
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </>}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        description="Solicitudes comerciales, ensayos y normativa acordada."
        actions={canManage && <button className="catalog-primary-button" onClick={openCreate} type="button">Nueva cotización</button>}
      />
      {error && <ErrorState message={error} title="No se pudo completar la operación" />}
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      <div className="catalog-toolbar">
        <label>Buscar<input onChange={(event) => setSearch(event.target.value)} placeholder="Código o cliente" value={search} /></label>
        <label>Estado
          <select onChange={(event) => setStatusFilter(event.target.value as QuoteStatus | 'ALL')} value={statusFilter}>
            <option value="ALL">Todos</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {loading ? <LoadingState message="Cargando cotizaciones…" /> :
        filteredQuotes.length
          ? <DataTable caption="Cotizaciones" columns={columns} rowKey={(quote) => quote.id} rows={filteredQuotes} />
          : <EmptyState title="No hay cotizaciones para mostrar" description="Crea una cotización o ajusta la búsqueda y los filtros." />}

      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title={editingQuote ? `Editar ${editingQuote.code}` : 'Nueva cotización'}>
        <form className="catalog-form" onSubmit={(event) => void handleSave(event)}>
          <label>Cliente
            <select onChange={(event) => setFormValues({ ...formValues, client_id: event.target.value, contact_id: '' })} required value={formValues.client_id}>
              <option value="">Selecciona un cliente</option>
              {clients.filter((client) => client.active).map((client) => <option key={client.id} value={client.id}>{client.business_name}{client.nit ? ` · ${client.nit}` : ''}</option>)}
            </select>
          </label>
          <label>Contacto
            <select onChange={(event) => setFormValues({ ...formValues, contact_id: event.target.value })} value={formValues.contact_id}>
              <option value="">Sin contacto</option>
              {clientContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
            </select>
          </label>
          <div className="commercial-date-fields">
            <label>Fecha de cotización<input onChange={(event) => setFormValues({ ...formValues, quote_date: event.target.value })} required type="date" value={formValues.quote_date} /></label>
            <label>Vigente hasta<input onChange={(event) => setFormValues({ ...formValues, valid_until: event.target.value })} type="date" value={formValues.valid_until} /></label>
          </div>
          <fieldset className="commercial-fieldset">
            <legend>Ensayos solicitados</legend>
            {!options?.tests.length && <p>No hay ensayos activos en el catálogo.</p>}
            {options?.tests.map((test) => {
              const current = selectedTests.find((item) => item.test_id === test.id)
              const issuability = options.issuability[test.id]
              const isIssuable = issuability?.issuable === true
              const missing = Array.isArray(issuability?.missing_fields) ? issuability.missing_fields.join(', ') : ''
              return (
                <div className="commercial-test-row" key={test.id}>
                  <label className="commercial-test-choice">
                    <input
                      checked={!!current}
                      onChange={(event) => setSelectedTests((rows) => event.target.checked
                        ? [...rows, { test_id: test.id, matrix_id: null, suggested_laboratory_id: null, notes: null }]
                        : rows.filter((item) => item.test_id !== test.id))}
                      type="checkbox"
                    />
                    <span>{test.code} · {test.parameter_name ?? 'Parámetro sin nombre'}</span>
                  </label>
                  {current && (
                    <div className="commercial-test-options">
                      <label>Matriz<select onChange={(event) => setSelectedTests((rows) => rows.map((item) => item.test_id === test.id ? { ...item, matrix_id: event.target.value || null } : item))} value={current.matrix_id ?? ''}>
                        <option value="">Sin especificar</option>
                        {options.matrices.map((matrix) => <option key={matrix.id} value={matrix.id}>{matrix.code} · {matrix.name}</option>)}
                      </select></label>
                      <label>Laboratorio sugerido<select onChange={(event) => setSelectedTests((rows) => rows.map((item) => item.test_id === test.id ? { ...item, suggested_laboratory_id: event.target.value || null } : item))} value={current.suggested_laboratory_id ?? ''}>
                        <option value="">Sin especificar</option>
                        {options.laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.code} · {lab.name}</option>)}
                      </select></label>
                    </div>
                  )}
                  {current && !isIssuable && (
                    <p className="commercial-warning">Advertencia: ensayo marcado como no emitible{missing ? ` (${missing})` : ''}. La cotización puede guardarse.</p>
                  )}
                </div>
              )
            })}
          </fieldset>
          <fieldset className="commercial-fieldset">
            <legend>Normativa acordada (sugerencia)</legend>
            {regulations.map((regulation, index) => (
              <div className="commercial-regulation" key={`regulation-${index}`}>
                <label>Norma<input onChange={(event) => setRegulations((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, regulation_name: event.target.value } : item))} value={regulation.regulation_name} /></label>
                <label>Artículo<input onChange={(event) => setRegulations((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, article: event.target.value } : item))} value={regulation.article} /></label>
                <label>Actividad<input onChange={(event) => setRegulations((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, activity: event.target.value } : item))} value={regulation.activity} /></label>
                <label>Tipo de descarga<select onChange={(event) => setRegulations((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, discharge_type: event.target.value as RegulationForm['discharge_type'] } : item))} value={regulation.discharge_type}>
                  <option value="ARD">ARD</option><option value="ARnD">ARnD</option><option value="NA">No aplica</option>
                </select></label>
                <label>Regla de decisión acordada<input onChange={(event) => setRegulations((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, decision_rule: event.target.value } : item))} value={regulation.decision_rule} /></label>
                <button onClick={() => setRegulations((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} type="button">Quitar normativa</button>
              </div>
            ))}
            <button onClick={() => setRegulations((rows) => [...rows, { ...emptyRegulation }])} type="button">Agregar normativa</button>
            <p className="catalog-form-note">La normativa heredada es una sugerencia; requiere confirmación humana en las etapas posteriores.</p>
          </fieldset>
          <label>Regla de decisión (texto libre)<textarea onChange={(event) => setFormValues({ ...formValues, decision_rule: event.target.value })} value={formValues.decision_rule} /></label>
          <label>Observaciones<textarea onChange={(event) => setFormValues({ ...formValues, observations: event.target.value })} value={formValues.observations} /></label>
          <div className="catalog-form-actions">
            <button disabled={saving} onClick={() => setFormOpen(false)} type="button">Cancelar</button>
            <button className="catalog-primary-button" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar borrador'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Cotización ${detail.quote.code}` : 'Detalle'}>
        {detail && <div className="catalog-form">
          <dl className="catalog-detail">
            <div><dt>Cliente</dt><dd>{clientLabels[detail.quote.client_id] ?? '—'}</dd></div>
            <div><dt>Contacto</dt><dd>{contacts.find((contact) => contact.id === detail.quote.contact_id)?.name ?? '—'}</dd></div>
            <div><dt>Estado</dt><dd>{statusLabels[detail.quote.status]}</dd></div>
            <div><dt>Fecha</dt><dd>{detail.quote.quote_date}</dd></div>
            <div><dt>Vigencia hasta</dt><dd>{detail.quote.valid_until ?? 'Sin fecha límite'}</dd></div>
            <div><dt>Regla de decisión</dt><dd>{detail.quote.decision_rule ?? '—'}</dd></div>
          </dl>
          <h3>Ensayos</h3>
          <ul>{detail.tests.map((item) => {
            const test = options?.tests.find((candidate) => candidate.id === item.test_id)
            return <li key={item.id ?? item.test_id}>{test ? `${test.code} · ${test.parameter_name ?? ''}` : item.test_id}</li>
          })}</ul>
          <h3>Normativa</h3>
          {detail.regulations.length
            ? <ul>{detail.regulations.map((item) => <li key={item.id}>{item.regulation_name} · {item.article ?? 'Sin artículo'} · {item.discharge_type} · {item.requires_confirmation ? 'Pendiente de confirmación' : 'Confirmada'}</li>)}</ul>
            : <p>Sin normativa registrada.</p>}
          <p>{detail.quote.observations ?? ''}</p>
        </div>}
      </Modal>
    </>
  )
}
