import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { listPendingResults } from '../services/results'
import type { PendingResult } from '../types/results'

export function PendingResultsPage() {
  const [rows, setRows] = useState<PendingResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await listPendingResults())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los ensayos pendientes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const groups = useMemo(() => {
    const grouped = new Map<string, PendingResult[]>()
    rows.forEach((row) => {
      const key = `${row.sample_id}:${row.laboratory_id ?? 'sin-laboratorio'}`
      const group = grouped.get(key) ?? []
      group.push(row)
      grouped.set(key, group)
    })
    return [...grouped.values()]
  }, [rows])

  const columns: DataTableColumn<PendingResult>[] = [
    { key: 'test', header: 'Ensayo solicitado', render: (row) => `${row.test_code} · ${row.parameter_name ?? ''}` },
    { key: 'laboratory', header: 'Laboratorio', render: (row) => row.laboratory_name ?? 'Sin laboratorio asignado' },
    {
      key: 'action',
      header: 'Acción',
      render: (row) => (
        <Link
          className="catalog-action-link"
          to={`/resultados/carga?sample_id=${encodeURIComponent(row.sample_id)}${row.laboratory_id ? `&laboratory_id=${encodeURIComponent(row.laboratory_id)}` : ''}`}
        >Cargar resultado</Link>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Ensayos solicitados sin resultado"
        description="Ensayos de las muestras que todavía no tienen un resultado confirmado para el laboratorio asignado."
      />
      {error && <ErrorState message={error} />}
      {loading ? <LoadingState message="Cargando ensayos pendientes…" /> :
        !rows.length ? (
          <EmptyState title="No hay ensayos pendientes" description="Todos los ensayos solicitados tienen resultados registrados." />
        ) : groups.map((group) => (
          <section className="external-pending-group" key={`${group[0].sample_id}:${group[0].laboratory_id ?? 'sin-laboratorio'}`}>
            <h2>{group[0].sample_code} · {group[0].client_name}</h2>
            <DataTable
              caption={`Ensayos pendientes de ${group[0].sample_code}`}
              columns={columns}
              rowKey={(row) => row.sample_test_id}
              rows={group}
            />
          </section>
        ))}
    </div>
  )
}
