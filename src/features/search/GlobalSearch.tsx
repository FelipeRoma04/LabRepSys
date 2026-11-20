import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchRecords } from './searchService'
import type { SearchFilters, SearchResult } from './searchTypes'

const initialFilters: SearchFilters = {
  term: '',
  type: 'all',
  status: '',
  dateFrom: '',
  dateTo: '',
  clientId: '',
  laboratoryId: '',
}

function resultUrl(result: SearchResult, term: string): string {
  const params = new URLSearchParams({ q: term, type: result.type })
  return `/buscar?${params.toString()}`
}

export function GlobalSearch() {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trimmed = term.trim()
    if (!trimmed) return

    let active = true
    const timeout = window.setTimeout(() => {
      void searchRecords({ ...initialFilters, term: trimmed }, 0)
        .then((response) => {
          if (!active) return
          setResults(response.items.slice(0, 6))
          setError(null)
        })
        .catch((cause: unknown) => {
          if (!active) return
          setResults([])
          setError(cause instanceof Error ? cause.message : 'No fue posible buscar.')
        })
        .finally(() => {
          if (active) setIsLoading(false)
        })
    }, 300)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [term])

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  return (
    <div className="global-search" ref={wrapperRef}>
      <label className="sr-only" htmlFor="global-search-input">Búsqueda global</label>
      <input
        autoComplete="off"
        id="global-search-input"
        onChange={(event) => {
          setTerm(event.target.value)
          setIsOpen(true)
          setIsLoading(Boolean(event.target.value.trim()))
          setError(null)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setIsOpen(false)
        }}
        placeholder="Buscar muestras, clientes, RSA…"
        role="combobox"
        aria-expanded={isOpen && Boolean(term.trim())}
        aria-controls="global-search-results"
        value={term}
      />
      {isOpen && term.trim() && (
        <div className="global-search-results" id="global-search-results" role="listbox">
          {isLoading && <p className="search-hint" role="status">Buscando…</p>}
          {!isLoading && error && <p className="search-error">{error}</p>}
          {!isLoading && !error && !results.length && (
            <p className="search-hint">No se encontraron coincidencias.</p>
          )}
          {!isLoading && results.map((result) => (
            <Link
              className="global-search-result"
              key={`${result.type}:${result.id}`}
              onClick={() => setIsOpen(false)}
              role="option"
              to={resultUrl(result, term.trim())}
            >
              <span>
                <strong>{result.title || 'Sin identificador'}</strong>
                <small>{result.clientName ?? result.subtitle}</small>
              </span>
              <small>{result.type}</small>
            </Link>
          ))}
          <Link
            className="global-search-all"
            onClick={() => setIsOpen(false)}
            to={`/buscar?q=${encodeURIComponent(term.trim())}`}
          >
            Ver todos los resultados
          </Link>
        </div>
      )}
    </div>
  )
}
