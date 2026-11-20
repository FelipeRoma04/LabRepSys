import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LoadingState } from '../../components/LoadingState'
import {
  isMissingSchemaError,
  loadSearchFilterOptions,
  searchRecords,
} from './searchService'
import {
  canExportSearch,
  createSearchCsv,
  searchEntityTypes,
  type SearchEntityType,
  type SearchFilters,
  type SearchResult,
} from './searchTypes'

const pageSize = 20
const entityLabels: Record<SearchEntityType, string> = {
  sample: 'Muestra',
  quote: 'Cotización',
  client: 'Cliente',
  report: 'Reporte RSA',
}

const statusOptions = [
  'DRAFT',
  'ACTIVE',
  'EXPIRED',
  'CANCELLED',
  'RECEIVED',
  'VALIDATING',
  'READY_FOR_REVIEW',
  'IN_REVIEW',
  'RETURNED',
  'APPROVED',
  'ISSUED',
  'RECTIFIED',
  'VOIDED',
]

function typeFromValue(value: string | null): SearchFilters['type'] {
  return value && searchEntityTypes.includes(value as SearchEntityType)
    ? (value as SearchEntityType)
    : 'all'
}

function resultUrl(result: SearchResult): string {
  const entityRoutes: Record<SearchEntityType, string> = {
    sample: '/muestras',
    quote: '/cotizaciones',
    client: '/clientes',
    report: '/reportes/borradores',
  }
  const params = new URLSearchParams({ id: result.id, q: result.title })
  return `${entityRoutes[result.type]}?${params.toString()}`
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { roles } = useAuth()
  const [otherFilters, setOtherFilters] = useState<Omit<SearchFilters, 'term' | 'type'>>({
    status: '',
    dateFrom: '',
    dateTo: '',
    clientId: '',
    laboratoryId: '',
  })
  const filters = useMemo<SearchFilters>(() => ({
    ...otherFilters,
    term: searchParams.get('q') ?? '',
    type: typeFromValue(searchParams.get('type')),
  }), [otherFilters, searchParams])
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [laboratories, setLaboratories] = useState<{ id: string; name: string }[]>([])
  const [filterOptionsPending, setFilterOptionsPending] = useState(false)

  useEffect(() => {
    void loadSearchFilterOptions()
      .then((options) => {
        setClients(options.clients)
        setLaboratories(options.laboratories)
      })
      .catch((cause: unknown) => {
        setClients([])
        setLaboratories([])
        setFilterOptionsPending(isMissingSchemaError(cause))
      })
  }, [])

  useEffect(() => {
    let active = true
    const timeout = window.setTimeout(() => {
      setIsLoading(true)
      setError(null)
      setPending(false)
      void searchRecords(filters, page)
        .then((response) => {
          if (!active) return
          setItems(response.items)
          setTotal(response.total)
        })
        .catch((cause: unknown) => {
          if (!active) return
          setItems([])
          setTotal(0)
          if (isMissingSchemaError(cause)) {
            setPending(true)
            setError('La búsqueda está pendiente: falta una tabla o columna requerida en el esquema actual.')
          } else {
            setError(cause instanceof Error ? cause.message : 'No fue posible completar la búsqueda.')
          }
        })
        .finally(() => {
          if (active) setIsLoading(false)
        })
    }, filters.term.trim() ? 250 : 0)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [filters, page])

  const updateFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setPage(0)
    if (key === 'term') {
      const next = new URLSearchParams(searchParams)
      if (value) next.set('q', String(value))
      else next.delete('q')
      setSearchParams(next, { replace: true })
    }
    if (key === 'type') {
      const next = new URLSearchParams(searchParams)
      if (value === 'all') next.delete('type')
      else next.set('type', String(value))
      setSearchParams(next, { replace: true })
    }
    if (key !== 'term' && key !== 'type') {
      setOtherFilters((current) => ({ ...current, [key]: value }))
    }
  }

  const downloadCsv = () => {
    if (!canExportSearch(roles.map((role) => role.code))) return
    const csv = `\uFEFF${createSearchCsv(items)}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'busqueda-global.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className="search-page">
      <header className="page-header">
        <p className="eyebrow">Consulta transversal</p>
        <h1>Búsqueda global</h1>
        <p>Busca información visible para tu sesión y combina filtros.</p>
      </header>

      <form className="search-filters" onSubmit={(event) => event.preventDefault()}>
        <label className="search-filter-wide">
          Texto
          <input
            onChange={(event) => updateFilter('term', event.target.value)}
            placeholder="RSA, muestra, plan, punto o cliente"
            value={filters.term}
          />
        </label>
        <label>
          Tipo
          <select
            onChange={(event) => updateFilter('type', event.target.value as SearchFilters['type'])}
            value={filters.type}
          >
            <option value="all">Todos</option>
            {searchEntityTypes.map((type) => (
              <option key={type} value={type}>{entityLabels[type]}</option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select onChange={(event) => updateFilter('status', event.target.value)} value={filters.status}>
            <option value="">Todos</option>
            {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </label>
        <label>
          Desde
          <input
            onChange={(event) => updateFilter('dateFrom', event.target.value)}
            type="date"
            value={filters.dateFrom}
          />
        </label>
        <label>
          Hasta
          <input
            onChange={(event) => updateFilter('dateTo', event.target.value)}
            type="date"
            value={filters.dateTo}
          />
        </label>
        <label>
          Cliente
          <select onChange={(event) => updateFilter('clientId', event.target.value)} value={filters.clientId}>
            <option value="">Todos</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label>
          Laboratorio
          <select
            onChange={(event) => updateFilter('laboratoryId', event.target.value)}
            value={filters.laboratoryId}
          >
            <option value="">Todos</option>
            {laboratories.map((laboratory) => (
              <option key={laboratory.id} value={laboratory.id}>{laboratory.name}</option>
            ))}
          </select>
        </label>
      </form>
      {filterOptionsPending && (
        <p className="search-pending" role="status">
          Los filtros de cliente y laboratorio están pendientes: falta una tabla o columna requerida.
        </p>
      )}

      <div className="search-toolbar">
        <p>{total} resultado{total === 1 ? '' : 's'}</p>
        {canExportSearch(roles.map((role) => role.code)) ? (
          <div className="search-export">
            <button disabled={!items.length || isLoading} onClick={downloadCsv} type="button">
              Exportar página CSV
            </button>
            <small role="status">Auditoría de exportación pendiente: no hay RPC autorizado disponible.</small>
          </div>
        ) : (
          <p className="search-export-denied">La exportación está reservada a roles autorizados.</p>
        )}
      </div>

      {isLoading && <LoadingState message="Buscando…" />}
      {!isLoading && error && (
        <div className={pending ? 'search-pending' : 'search-error'} role="alert">
          <strong>{pending ? 'Función pendiente' : 'Error de búsqueda'}</strong>
          <p>{error}</p>
        </div>
      )}
      {!isLoading && !error && items.length === 0 && (
        <div className="search-empty" role="status">No se encontraron resultados con estos filtros.</div>
      )}
      {!isLoading && !error && items.length > 0 && (
        <>
          <div className="search-results">
            {searchEntityTypes.map((type) => {
              const typeItems = items.filter((item) => item.type === type)
              if (!typeItems.length) return null
              return (
                <section key={type}>
                  <h2>{entityLabels[type]}</h2>
                  <ul>
                    {typeItems.map((item) => (
                      <li key={`${item.type}:${item.id}`}>
                        <Link to={resultUrl(item)}>
                          <span className="search-result-type">{entityLabels[item.type]}</span>
                          <strong>{item.title || 'Sin identificador'}</strong>
                          {item.clientName && <span>{item.clientName}</span>}
                          {item.subtitle && <span>{item.subtitle}</span>}
                          <span>{item.status}</span>
                          <time>{item.date ? new Date(item.date).toLocaleDateString() : '—'}</time>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
          <nav aria-label="Paginación de búsqueda" className="search-pagination">
            <button disabled={page === 0 || isLoading} onClick={() => setPage((value) => value - 1)} type="button">
              Anterior
            </button>
            <span>Página {page + 1} de {pageCount}</span>
            <button
              disabled={page + 1 >= pageCount || isLoading}
              onClick={() => setPage((value) => value + 1)}
              type="button"
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
    </section>
  )
}
