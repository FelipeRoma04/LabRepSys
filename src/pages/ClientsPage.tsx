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
  createClient,
  findClientByNit,
  findSimilarClients,
  listClients,
  listContacts,
  saveContact,
  setClientActive,
  setContactActive,
  updateClient,
} from '../services/commercial'
import type { Client, Contact, SimilarClient } from '../types/commercial'

type ActiveFilter = 'all' | 'active' | 'inactive'
type ClientValues = {
  nit: string
  business_name: string
  alias: string
  address: string
  city: string
  preferred_regulation_note: string
}
type ContactValues = {
  name: string
  job_title: string
  email: string
  phone: string
}

const emptyClient: ClientValues = {
  nit: '',
  business_name: '',
  alias: '',
  address: '',
  city: '',
  preferred_regulation_note: '',
}
const emptyContact: ContactValues = { name: '', job_title: '', email: '', phone: '' }

function nullable(value: string): string | null {
  return value.trim() || null
}

export function ClientsPage() {
  const { roles } = useAuth()
  const canManage = roles.some((role) => ['ADMIN', 'COMERCIAL'].includes(role.code))
  const [clients, setClients] = useState<Client[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [clientValues, setClientValues] = useState<ClientValues>(emptyClient)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [similarClients, setSimilarClients] = useState<SimilarClient[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [contactOpen, setContactOpen] = useState(false)
  const [contactClientId, setContactClientId] = useState<string | null>(null)
  const [contactValues, setContactValues] = useState<ContactValues>(emptyContact)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [clientRows, contactRows] = await Promise.all([listClients(), listContacts()])
      setClients(clientRows)
      setContacts(contactRows)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los clientes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  const filteredClients = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return clients.filter((client) => {
      if (activeFilter === 'active' && !client.active) return false
      if (activeFilter === 'inactive' && client.active) return false
      if (!term) return true
      return [
        client.nit,
        client.business_name,
        client.alias,
        ...contacts
          .filter((contact) => contact.client_id === client.id)
          .flatMap((contact) => [contact.name, contact.email]),
      ].some((value) => value?.toLocaleLowerCase().includes(term))
    })
  }, [activeFilter, clients, contacts, search])

  const openCreate = () => {
    setEditingClient(null)
    setClientValues(emptyClient)
    setSimilarClients([])
    setFormOpen(true)
  }

  const openEdit = (client: Client) => {
    setEditingClient(client)
    setClientValues({
      nit: client.nit ?? '',
      business_name: client.business_name,
      alias: client.alias ?? '',
      address: client.address ?? '',
      city: client.city ?? '',
      preferred_regulation_note: client.preferred_regulation_note ?? '',
    })
    setSimilarClients([])
    setFormOpen(true)
  }

  const persistClient = async () => {
    const payload = {
      nit: nullable(clientValues.nit),
      business_name: clientValues.business_name.trim(),
      alias: nullable(clientValues.alias),
      address: nullable(clientValues.address),
      city: nullable(clientValues.city),
      preferred_regulation_note: nullable(clientValues.preferred_regulation_note),
    }
    if (editingClient) await updateClient(editingClient.id, payload)
    else await createClient(payload)
    setFormOpen(false)
    setSimilarClients([])
    setNotice(editingClient ? 'Cliente actualizado.' : 'Cliente creado.')
    await reload()
  }

  const handleSaveClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const nit = clientValues.nit.trim()
      if (nit && await findClientByNit(nit, editingClient?.id ?? null)) {
        throw new Error('Ya existe un cliente con ese NIT. El NIT debe ser único.')
      }
      const similar = await findSimilarClients(
        clientValues.business_name.trim(),
        editingClient?.id ?? null,
      )
      if (similar.length) {
        setSimilarClients(similar)
      } else {
        await persistClient()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cliente.')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmSimilar = async () => {
    setSaving(true)
    setError(null)
    try {
      await persistClient()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cliente.')
    } finally {
      setSaving(false)
    }
  }

  const toggleClientActive = async (client: Client) => {
    try {
      await setClientActive(client.id, !client.active)
      setNotice(client.active ? 'Cliente inactivado.' : 'Cliente activado.')
      await reload()
      if (selectedClient?.id === client.id) {
        setSelectedClient({ ...client, active: !client.active })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado del cliente.')
    }
  }

  const openContact = (contact?: Contact) => {
    if (!selectedClient) return
    setContactClientId(selectedClient.id)
    setSelectedClient(null)
    setEditingContact(contact ?? null)
    setContactValues(contact ? {
      name: contact.name,
      job_title: contact.job_title ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
    } : emptyContact)
    setContactOpen(true)
  }

  const handleSaveContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!contactClientId) return
    setSaving(true)
    setError(null)
    try {
      await saveContact(contactClientId, {
        name: contactValues.name.trim(),
        job_title: nullable(contactValues.job_title),
        email: nullable(contactValues.email),
        phone: nullable(contactValues.phone),
      }, editingContact?.id)
      setContactOpen(false)
      setNotice(editingContact ? 'Contacto actualizado.' : 'Contacto agregado.')
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el contacto.')
    } finally {
      setSaving(false)
    }
  }

  const columns: DataTableColumn<Client>[] = [
    { key: 'nit', header: 'NIT', render: (client) => client.nit || '—' },
    { key: 'business_name', header: 'Razón social', render: (client) => client.business_name },
    { key: 'alias', header: 'Alias', render: (client) => client.alias || '—' },
    {
      key: 'contacts',
      header: 'Contactos',
      render: (client) => contacts.filter((contact) => contact.client_id === client.id && contact.active).length,
    },
    {
      key: 'active',
      header: 'Estado',
      render: (client) => (
        <StatusBadge label={client.active ? 'Activo' : 'Inactivo'} tone={client.active ? 'success' : 'neutral'} />
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (client) => (
        <div className="catalog-row-actions">
          <button type="button" onClick={() => setSelectedClient(client)}>Detalle</button>
          {canManage && <>
            <button type="button" onClick={() => openEdit(client)}>Editar</button>
            <button type="button" onClick={() => void toggleClientActive(client)}>
              {client.active ? 'Inactivar' : 'Activar'}
            </button>
          </>}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Clientes, datos de identificación y contactos comerciales."
        actions={canManage && <button className="catalog-primary-button" onClick={openCreate} type="button">Nuevo cliente</button>}
      />
      {error && <ErrorState message={error} title="No se pudo completar la operación" />}
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      <div className="catalog-toolbar">
        <label>
          Buscar
          <input onChange={(event) => setSearch(event.target.value)} placeholder="NIT, razón social, alias o contacto" value={search} />
        </label>
        <label>
          Estado
          <select onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)} value={activeFilter}>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
            <option value="all">Todos</option>
          </select>
        </label>
      </div>
      {loading ? <LoadingState message="Cargando clientes…" /> :
        filteredClients.length
          ? <DataTable caption="Clientes" columns={columns} rowKey={(client) => client.id} rows={filteredClients} />
          : <EmptyState title="No hay clientes para mostrar" description="Crea un cliente o ajusta la búsqueda y los filtros." />}

      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title={similarClients.length ? 'Posible cliente duplicado' : editingClient ? 'Editar cliente' : 'Nuevo cliente'}>
        {similarClients.length ? (
          <div className="catalog-form">
            <p>Se encontraron razones sociales similares. Revísalas; puedes continuar si corresponde a otra entidad.</p>
            <ul>
              {similarClients.map((client) => <li key={client.id}>{client.business_name} ({Math.round(client.similarity_score * 100)}% de similitud)</li>)}
            </ul>
            <div className="catalog-form-actions">
              <button disabled={saving} onClick={() => setSimilarClients([])} type="button">Volver a editar</button>
              <button className="catalog-primary-button" disabled={saving} onClick={() => void handleConfirmSimilar()} type="button">Continuar y guardar</button>
            </div>
          </div>
        ) : (
          <form className="catalog-form" onSubmit={(event) => void handleSaveClient(event)}>
            <label>NIT<input onChange={(event) => setClientValues({ ...clientValues, nit: event.target.value })} value={clientValues.nit} /></label>
            <label>Razón social<input onChange={(event) => setClientValues({ ...clientValues, business_name: event.target.value })} required value={clientValues.business_name} /></label>
            <label>Alias<input onChange={(event) => setClientValues({ ...clientValues, alias: event.target.value })} value={clientValues.alias} /></label>
            <label>Dirección<input onChange={(event) => setClientValues({ ...clientValues, address: event.target.value })} value={clientValues.address} /></label>
            <label>Ciudad<input onChange={(event) => setClientValues({ ...clientValues, city: event.target.value })} value={clientValues.city} /></label>
            <label>Nota de normativa preferida<textarea onChange={(event) => setClientValues({ ...clientValues, preferred_regulation_note: event.target.value })} value={clientValues.preferred_regulation_note} /></label>
            <p className="catalog-form-note">La nota normativa es solo una sugerencia y requiere confirmación en cada cotización.</p>
            <div className="catalog-form-actions">
              <button disabled={saving} onClick={() => setFormOpen(false)} type="button">Cancelar</button>
              <button className="catalog-primary-button" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!selectedClient} onClose={() => setSelectedClient(null)} title={selectedClient?.business_name ?? 'Detalle del cliente'}>
        {selectedClient && (
          <div className="catalog-form">
            <dl className="catalog-detail">
              <div><dt>NIT</dt><dd>{selectedClient.nit || '—'}</dd></div>
              <div><dt>Alias</dt><dd>{selectedClient.alias || '—'}</dd></div>
              <div><dt>Dirección</dt><dd>{selectedClient.address || '—'}</dd></div>
              <div><dt>Ciudad</dt><dd>{selectedClient.city || '—'}</dd></div>
              <div><dt>Nota normativa preferida</dt><dd>{selectedClient.preferred_regulation_note || '—'} (sugerencia)</dd></div>
            </dl>
            <div className="page-header-content">
              <h3>Contactos</h3>
              {canManage && <button onClick={() => openContact()} type="button">Agregar contacto</button>}
            </div>
            {contacts.filter((contact) => contact.client_id === selectedClient.id).length === 0
              ? <p>No hay contactos registrados.</p>
              : <ul className="contact-list">
                  {contacts.filter((contact) => contact.client_id === selectedClient.id).map((contact) => (
                    <li key={contact.id}>
                      <span><strong>{contact.name}</strong> · {contact.job_title || 'Sin cargo'} · {contact.email || 'Sin correo'} · {contact.phone || 'Sin teléfono'} · {contact.active ? 'Activo' : 'Inactivo'}</span>
                      {canManage && <span className="catalog-row-actions">
                        <button onClick={() => openContact(contact)} type="button">Editar</button>
                        <button onClick={() => void setContactActive(contact.id, !contact.active).then(reload).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado del contacto.'))} type="button">
                          {contact.active ? 'Inactivar' : 'Activar'}
                        </button>
                      </span>}
                    </li>
                  ))}
                </ul>}
          </div>
        )}
      </Modal>

      <Modal open={contactOpen} onClose={() => !saving && setContactOpen(false)} title={editingContact ? 'Editar contacto' : 'Agregar contacto'}>
        <form className="catalog-form" onSubmit={(event) => void handleSaveContact(event)}>
          <label>Nombre<input onChange={(event) => setContactValues({ ...contactValues, name: event.target.value })} required value={contactValues.name} /></label>
          <label>Cargo<input onChange={(event) => setContactValues({ ...contactValues, job_title: event.target.value })} value={contactValues.job_title} /></label>
          <label>Correo<input onChange={(event) => setContactValues({ ...contactValues, email: event.target.value })} type="email" value={contactValues.email} /></label>
          <label>Teléfono<input onChange={(event) => setContactValues({ ...contactValues, phone: event.target.value })} value={contactValues.phone} /></label>
          <div className="catalog-form-actions">
            <button disabled={saving} onClick={() => setContactOpen(false)} type="button">Cancelar</button>
            <button className="catalog-primary-button" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar contacto'}</button>
          </div>
        </form>
      </Modal>
    </>
  )
}
