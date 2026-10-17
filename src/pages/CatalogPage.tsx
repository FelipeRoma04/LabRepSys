import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import {
  createCatalogRecord,
  createTestVersion,
  importTestsCsv,
  listCatalogRecords,
  listReferenceRecords,
  listTestIssuability,
  setCatalogRecordActive,
  updateCatalogRecord,
  type ActiveFilter,
  type CsvImportError,
} from '../services/catalogs'
import {
  catalogDefinitions,
  type CatalogDefinition,
  type CatalogField,
  type CatalogRecord,
  type CatalogTable,
} from '../types/catalogs'

const relatedCatalogs: Partial<Record<CatalogTable, CatalogTable[]>> = {
  laboratories: ['laboratory_accreditations', 'laboratory_accredited_tests'],
  tests: ['test_aliases', 'test_groups', 'test_group_members', 'laboratory_accredited_tests'],
}

function rowId(row: CatalogRecord): string {
  return typeof row.id === 'string' ? row.id : ''
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  return String(value)
}

function initialFormValues(
  definition: CatalogDefinition,
  row: CatalogRecord | null,
  editing: boolean,
): Record<string, string> {
  return Object.fromEntries(
    definition.fields
      .filter((field) => !(editing && definition.table === 'tests' && field.key === 'code'))
      .map((field) => {
        const value = row?.[field.key]
        return [
          field.key,
          field.type === 'json'
            ? JSON.stringify(value ?? {}, null, 2)
            : value === null || value === undefined
              ? ''
              : String(value),
        ]
      }),
  )
}

function toPayload(
  definition: CatalogDefinition,
  values: Record<string, string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of definition.fields) {
    const value = values[field.key]?.trim() ?? ''
    if (!value) {
      payload[field.key] = null
    } else if (field.type === 'number') {
      const numberValue = Number(value.replace(',', '.'))
      if (!Number.isFinite(numberValue)) {
        throw new Error(`${field.label}: ingrese un número válido.`)
      }
      payload[field.key] = numberValue
    } else if (field.type === 'json') {
      try {
        payload[field.key] = JSON.parse(value) as unknown
      } catch {
        throw new Error(`${field.label}: el contenido debe ser JSON válido.`)
      }
    } else {
      payload[field.key] = value
    }
  }
  return payload
}

interface CatalogPageProps {
  table: CatalogTable
}

export function CatalogPage({ table }: CatalogPageProps) {
  const definition = catalogDefinitions[table]
  const { roles } = useAuth()
  const canManage = roles.some((role) => role.code === 'ADMIN')
  const resources = useMemo(
    () => [table, ...(relatedCatalogs[table] ?? [])],
    [table],
  )
  const [selectedTable, setSelectedTable] = useState<CatalogTable>(table)
  const selectedDefinition = catalogDefinitions[selectedTable]
  const [rows, setRows] = useState<CatalogRecord[]>([])
  const [references, setReferences] = useState<Record<string, CatalogRecord[]>>({})
  const [issuability, setIssuability] = useState<Record<string, CatalogRecord>>({})
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<CatalogRecord | null>(null)
  const [editingRow, setEditingRow] = useState<CatalogRecord | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [importErrors, setImportErrors] = useState<CsvImportError[] | null>(null)
  const [importing, setImporting] = useState(false)
  const isTestVersion = selectedTable === 'tests' && editingRow !== null
  const listRequestVersion = useRef(0)

  const loadRows = useCallback(async () => {
    const requestVersion = ++listRequestVersion.current
    try {
      const [records, issueRows] = await Promise.all([
        listCatalogRecords(
          selectedTable,
          search,
          activeFilter,
          selectedDefinition.searchFields,
        ),
        selectedTable === 'tests' ? listTestIssuability() : Promise.resolve([]),
      ])
      if (requestVersion !== listRequestVersion.current) return
      setRows(records)
      if (selectedTable === 'tests') {
        setIssuability(
          Object.fromEntries(issueRows.map((row) => [String(row.id), row])),
        )
      }
    } catch (cause) {
      if (requestVersion !== listRequestVersion.current) return
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo.')
    } finally {
      if (requestVersion === listRequestVersion.current) setLoading(false)
    }
  }, [activeFilter, search, selectedDefinition.searchFields, selectedTable])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRows()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadRows])

  useEffect(() => {
    let cancelled = false
    const referenceTables = Array.from(
      new Set(
        resources.flatMap((resource) =>
          catalogDefinitions[resource].fields.flatMap((field) =>
            field.reference ? [field.reference.table] : [],
          ),
        ),
      ),
    )

    void Promise.all(
      referenceTables.map(async (referenceTable) => {
        const labelField = catalogDefinitions[referenceTable].fields.find(
          (field) => field.key === 'name',
        )?.key ??
          (referenceTable === 'tests'
            ? 'code'
            : referenceTable === 'laboratory_accreditations'
              ? 'resolution'
              : 'code')
        const values = await listReferenceRecords(referenceTable, labelField)
        return [referenceTable, values] as const
      }),
    )
      .then((entries) => {
        if (!cancelled) setReferences(Object.fromEntries(entries))
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las opciones.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [resources])

  const referenceLabels = useMemo(() => {
    const labels: Record<string, string> = {}
    for (const records of Object.values(references)) {
      for (const record of records) {
        if (typeof record.id !== 'string') continue
        const label =
          (typeof record.name === 'string' && record.name) ||
          (typeof record.code === 'string' && record.code) ||
          (typeof record.resolution === 'string' && record.resolution) ||
          record.id
        labels[record.id] = label
      }
    }
    return labels
  }, [references])

  const openCreate = () => {
    setEditingRow(null)
    const values = initialFormValues(selectedDefinition, null, false)
    if (selectedTable === 'report_templates') {
      values.configuration = '{}'
    }
    setFormValues(values)
    setNotice(null)
    setFormOpen(true)
  }

  const openEdit = (row: CatalogRecord) => {
    setDetailRow(null)
    setEditingRow(row)
    setFormValues(initialFormValues(selectedDefinition, row, true))
    setNotice(null)
    setFormOpen(true)
  }

  const closeForm = () => {
    if (saving) return
    setFormOpen(false)
    setEditingRow(null)
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const payload = toPayload(selectedDefinition, formValues)
      for (const field of selectedDefinition.fields) {
        if (isTestVersion && field.key === 'code') continue
        if (isTestVersion && field.key === 'valid_from' && payload[field.key] === null) {
          throw new Error('La fecha de vigencia es obligatoria para crear una versión.')
        }
        if (field.required && (payload[field.key] === null || payload[field.key] === '')) {
          throw new Error(`${field.label} es obligatorio.`)
        }
      }

      if (editingRow) {
        const id = rowId(editingRow)
        if (selectedTable === 'tests') {
          delete payload.code
          await createTestVersion(id, payload)
          setNotice('Se creó una nueva versión del ensayo.')
        } else {
          await updateCatalogRecord(selectedTable, id, payload)
          setNotice('Registro actualizado.')
        }
      } else {
        if (selectedTable === 'tests' && !/^SA/.test(String(payload.code ?? ''))) {
          throw new Error('Los códigos de ensayo vigentes deben comenzar con SA.')
        }
        await createCatalogRecord(selectedTable, payload)
        setNotice('Registro creado.')
      }
      setFormOpen(false)
      setEditingRow(null)
      await loadRows()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el registro.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: CatalogRecord) => {
    const id = rowId(row)
    const currentlyActive = row.active === true
    const action = currentlyActive ? 'inactivar' : 'activar'
    if (!window.confirm(`¿Confirma ${action} este registro?`)) return
    setError(null)
    setNotice(null)
    try {
      await setCatalogRecordActive(selectedTable, id, !currentlyActive)
      setNotice(currentlyActive ? 'Registro inactivado.' : 'Registro activado.')
      setDetailRow(null)
      await loadRows()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado.')
    }
  }

  const handleCsvImport = async (file: File | undefined) => {
    if (!file) return
    setImporting(true)
    setImportErrors(null)
    setError(null)
    setNotice(null)
    try {
      const errors = await importTestsCsv(await file.text())
      setImportErrors(errors)
      setNotice(
        errors.length
          ? `Importación terminada con ${errors.length} fila(s) rechazadas.`
          : 'Importación completada sin errores.',
      )
      await loadRows()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo procesar el archivo CSV.')
    } finally {
      setImporting(false)
    }
  }

  const columns: DataTableColumn<CatalogRecord>[] = [
    ...selectedDefinition.columns.map(({ key, label }) => ({
      key,
      header: label,
      render: (row: CatalogRecord) => {
        if (key === 'active') {
          return (
            <StatusBadge
              label={row.active === true ? 'Activo' : 'Inactivo'}
              tone={row.active === true ? 'success' : 'neutral'}
            />
          )
        }
        if (key === 'issuable') {
          const item = issuability[rowId(row)]
          const issuable = item?.issuable === true
          const missing = Array.isArray(item?.missing_fields)
            ? item.missing_fields.map(String).join(', ')
            : ''
          return (
            <span title={missing}>
              <StatusBadge
                label={issuable ? 'Sí' : 'No emitible'}
                tone={issuable ? 'success' : 'warning'}
              />
            </span>
          )
        }
        if (key === 'execution_class') {
          const classification = issuability[rowId(row)]?.execution_class
          return displayValue(
            classification === 'SA_ACREDITADO'
              ? 'SA acreditado'
              : classification === 'SA_NO_ACREDITADO'
                ? 'SA no acreditado'
                : classification === 'SUBCONTRATADO'
                  ? 'Subcontratado'
                  : classification,
          )
        }
        const field = selectedDefinition.fields.find((item) => item.key === key)
        const value = row[key]
        if (field?.reference && typeof value === 'string') {
          return referenceLabels[value] ?? '—'
        }
        const option = field?.options?.find((item) => item.value === value)
        if (key === 'status') {
          return value === 'DRAFT'
            ? 'Borrador'
            : value === 'APPROVED'
              ? 'Aprobada'
              : value === 'RETIRED'
                ? 'Retirada'
                : displayValue(value)
        }
        return option?.label ?? displayValue(value)
      },
    })),
    {
      key: 'active',
      header: 'Estado',
      render: (row) => (
        <StatusBadge
          label={row.active === true ? 'Activo' : 'Inactivo'}
          tone={row.active === true ? 'success' : 'neutral'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) => (
        <div className="catalog-row-actions">
          <button type="button" onClick={() => setDetailRow(row)}>Detalle</button>
          {selectedTable === 'report_templates' && row.active === true && (
            <Link
              className="catalog-action-link"
              to={`/catalogos/plantillas/${rowId(row)}/editar`}
            >
              Abrir editor
            </Link>
          )}
          {canManage && (
            <>
              {selectedTable !== 'report_templates' && (
                <button type="button" onClick={() => openEdit(row)}>
                  {selectedTable === 'tests' ? 'Nueva versión' : 'Editar'}
                </button>
              )}
              <button type="button" onClick={() => void toggleActive(row)}>
                {row.active === true ? 'Inactivar' : 'Activar'}
              </button>
            </>
          )}
        </div>
      ),
    },
  ]

  const renderField = (field: CatalogField) => {
    const id = `${selectedTable}-${field.key}`
    const common = {
      id,
      name: field.key,
      required: field.required || (isTestVersion && field.key === 'valid_from'),
      value: formValues[field.key] ?? '',
      onChange: (
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => setFormValues((current) => ({ ...current, [field.key]: event.target.value })),
    }

    if (field.type === 'textarea' || field.type === 'json') {
      return (
        <textarea
          {...common}
          rows={field.type === 'json' ? 8 : 3}
          spellCheck={field.type !== 'json'}
        />
      )
    }
    if (field.type === 'select') {
      const reference = field.reference
      const options = field.options ?? (reference
        ? (references[reference.table] ?? []).flatMap((record) => {
            if (typeof record.id !== 'string') return []
            const label = record[reference.label]
            return [{ value: record.id, label: displayValue(label) }]
          })
        : [])
      return (
        <select {...common}>
          <option value="">Sin especificar</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )
    }
    return (
      <input
        {...common}
        type={field.type === 'number' ? 'number' : field.type ?? 'text'}
        step={field.type === 'number' ? 'any' : undefined}
      />
    )
  }

  return (
    <>
      <PageHeader
        title={definition.title}
        description={definition.description}
        actions={
          canManage && (
            <div className="catalog-header-actions">
              {selectedTable === 'tests' && (
                <label className="catalog-file-button">
                  {importing ? 'Importando…' : 'Importar CSV'}
                  <input
                    accept=".csv,text/csv"
                    disabled={importing}
                    onChange={(event) => {
                      void handleCsvImport(event.currentTarget.files?.[0])
                      event.currentTarget.value = ''
                    }}
                    type="file"
                  />
                </label>
              )}
              <button className="catalog-primary-button" onClick={openCreate} type="button">
                Crear registro
              </button>
            </div>
          )
        }
      />

      {resources.length > 1 && (
        <nav aria-label="Catálogos relacionados" className="catalog-tabs">
          {resources.map((resource) => (
            <button
              aria-current={selectedTable === resource ? 'page' : undefined}
              className={selectedTable === resource ? 'active' : ''}
              key={resource}
              onClick={() => {
                setLoading(true)
                setError(null)
                setSelectedTable(resource)
                setSearch('')
                setError(null)
                setNotice(null)
                setImportErrors(null)
              }}
              type="button"
            >
              {catalogDefinitions[resource].title}
            </button>
          ))}
        </nav>
      )}

      <section className="catalog-toolbar" aria-label="Filtros">
        <label>
          Buscar
          <input
            onChange={(event) => {
              setLoading(true)
              setError(null)
              setSearch(event.target.value)
            }}
            placeholder="Escriba para buscar"
            type="search"
            value={search}
          />
        </label>
        <label>
          Estado
          <select
            onChange={(event) => {
              setLoading(true)
              setError(null)
              setActiveFilter(event.target.value as ActiveFilter)
            }}
            value={activeFilter}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </label>
      </section>

      {error && <ErrorState message={error} />}
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {importErrors && importErrors.length > 0 && (
        <section className="catalog-import-errors" aria-label="Errores de importación">
          <h2>Filas no importadas</h2>
          <ul>
            {importErrors.map((item) => (
              <li key={`${item.row}-${item.message}`}>Fila {item.row}: {item.message}</li>
            ))}
          </ul>
        </section>
      )}
      {loading ? (
        <LoadingState message="Cargando catálogo…" />
      ) : rows.length ? (
        <DataTable
          caption={selectedDefinition.title}
          columns={columns}
          rowKey={(row) => rowId(row)}
          rows={rows}
        />
      ) : (
        <EmptyState
          title="No hay registros"
          description="Ajuste la búsqueda o agregue un registro al catálogo."
        />
      )}

      <Modal
        onClose={closeForm}
        open={formOpen}
        title={
          editingRow
            ? isTestVersion ? 'Crear versión de ensayo' : `Editar ${selectedDefinition.title.toLowerCase()}`
            : `Crear ${selectedDefinition.title.toLowerCase()}`
        }
      >
        <form className="catalog-form" onSubmit={(event) => void handleSave(event)}>
          {selectedDefinition.fields
            .filter((field) => !(editingRow && selectedTable === 'tests' && field.key === 'code'))
            .map((field) => (
              <label key={field.key} htmlFor={`${selectedTable}-${field.key}`}>
                {field.label}
                {field.required || (isTestVersion && field.key === 'valid_from') ? ' *' : ''}
                {renderField(field)}
              </label>
            ))}
          <p className="catalog-form-note">
            Los campos técnicos vacíos se conservan como información faltante y el ensayo no será emitible.
          </p>
          <div className="catalog-form-actions">
            <button disabled={saving} type="button" onClick={closeForm}>Cancelar</button>
            <button className="catalog-primary-button" disabled={saving} type="submit">
              {saving ? 'Guardando…' : isTestVersion ? 'Crear versión' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        onClose={() => setDetailRow(null)}
        open={detailRow !== null}
        title={`Detalle de ${selectedDefinition.title.toLowerCase()}`}
      >
        {detailRow && (
          <dl className="catalog-detail">
            {selectedDefinition.fields.map((field) => {
              const value = detailRow[field.key]
              const resolved =
                field.reference && typeof value === 'string'
                  ? referenceLabels[value] ?? value
                  : field.options?.find((option) => option.value === value)?.label ??
                    displayValue(value)
              return (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{resolved}</dd>
                </div>
              )
            })}
            {selectedTable === 'report_templates' && (
              <>
                <div>
                  <dt>Estado de flujo</dt>
                  <dd>
                    {detailRow.status === 'APPROVED'
                      ? 'Aprobada'
                      : detailRow.status === 'RETIRED'
                        ? 'Retirada'
                        : 'Borrador'}
                  </dd>
                </div>
                <div>
                  <dt>Fecha de aprobación</dt>
                  <dd>{displayValue(detailRow.approval_date)}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Estado</dt>
              <dd>{detailRow.active === true ? 'Activo' : 'Inactivo'}</dd>
            </div>
            {selectedTable === 'tests' && (
              (() => {
                const issueData = issuability[rowId(detailRow)]
                const missingFields = Array.isArray(issueData?.missing_fields)
                  ? issueData.missing_fields.map(String)
                  : []
                return (
                  <div>
                    <dt>Emisión</dt>
                    <dd>
                      {issueData?.issuable === true ? 'Emitible' : 'No emitible'}
                      {missingFields.length > 0 && ` — Faltan: ${missingFields.join(', ')}`}
                      {typeof issueData?.execution_class === 'string' &&
                        ` — ${displayValue(issueData.execution_class)}`}
                    </dd>
                  </div>
                )
              })()
            )}
            {selectedTable === 'report_templates' && detailRow.active === true && (
              <div className="catalog-detail-actions">
                <Link
                  className="catalog-action-link"
                  to={`/catalogos/plantillas/${rowId(detailRow)}/editar`}
                >
                  Abrir editor
                </Link>
              </div>
            )}
            {canManage && selectedTable !== 'report_templates' && (
              <div className="catalog-detail-actions">
                  <button type="button" onClick={() => openEdit(detailRow)}>
                    {selectedTable === 'tests' ? 'Crear versión' : 'Editar'}
                  </button>
              </div>
            )}
          </dl>
        )}
      </Modal>
    </>
  )
}
