import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import {
  cancelExternalShipment,
  createExternalShipment,
  getExternalShipmentOptions,
  listExternalShipments,
} from '../services/externalShipments'
import type {
  AccreditationWarning,
  ExternalShipment,
  ExternalShipmentOptions,
  ExternalShipmentStatus,
} from '../types/externalShipments'
import type { SampleTestDetail } from '../types/samples'

const statusLabels: Record<ExternalShipmentStatus, string> = {
  PENDING_SEND: 'Pendiente de envío',
  SENT: 'Enviado',
  REPORT_RECEIVED: 'Reporte recibido',
  CANCELLED: 'Cancelado',
}

function toLocalDateTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toLocaleString('es-CO')
}

function testLabel(test: SampleTestDetail): string {
  return `${test.test?.code ?? test.test_id}${test.test?.parameter_name ? ` · ${test.test.parameter_name}` : ''}`
}

export function ExternalShipmentsPage() {
  const [searchParams] = useSearchParams()
  const { roles } = useAuth()
  const canManage = roles.some((role) => ['ADMIN', 'RECEPCION', 'ANALISTA'].includes(role.code))
  const [rows, setRows] = useState<ExternalShipment[]>([])
  const [options, setOptions] = useState<ExternalShipmentOptions | null>(null)
  const [sampleId, setSampleId] = useState(() => searchParams.get('sample_id') ?? '')
  const [laboratoryId, setLaboratoryId] = useState('')
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([])
  const [externalCode, setExternalCode] = useState('')
  const [sentAt, setSentAt] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [observations, setObservations] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<AccreditationWarning[]>([])
  const [shipmentToCancel, setShipmentToCancel] = useState<ExternalShipment | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [shipments, formOptions] = await Promise.all([
        listExternalShipments(),
        canManage ? getExternalShipmentOptions() : Promise.resolve(null),
      ])
      setRows(shipments)
      setOptions(formOptions)
      if (formOptions) {
        const requestedSample = searchParams.get('sample_id')
        if (requestedSample && formOptions.samples.some((sample) => sample.id === requestedSample)) {
          setSampleId(requestedSample)
        } else if (requestedSample) {
          setNotice('La muestra solicitada no está disponible para estructurar un envío.')
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los envíos externos.')
    } finally {
      setLoading(false)
    }
  }, [canManage, searchParams])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const selectedSample = options?.samples.find((sample) => sample.id === sampleId) ?? null
  const availableTests = useMemo(
    () => (selectedSample?.tests ?? []).filter((test) =>
      test.execution_type === 'SUBCONTRACTED' &&
      !options?.attachedSampleTestIds.includes(test.id) &&
      (!laboratoryId || test.assigned_laboratory_id === laboratoryId),
    ),
    [laboratoryId, options?.attachedSampleTestIds, selectedSample],
  )

  const columns: DataTableColumn<ExternalShipment>[] = [
    { key: 'sample', header: 'Muestra', render: (row) => row.sample?.code ?? row.sample_id },
    { key: 'client', header: 'Cliente', render: (row) => row.sample?.client?.business_name ?? '—' },
    { key: 'laboratory', header: 'Laboratorio', render: (row) => row.laboratory?.name ?? row.laboratory_id },
    { key: 'external_code', header: 'Código externo', render: (row) => row.external_code ?? '—' },
    { key: 'sent_at', header: 'Enviado', render: (row) => row.sent_at ? toLocalDateTime(row.sent_at) : 'Pendiente' },
    { key: 'expected_at', header: 'Fecha esperada', render: (row) => row.expected_at ? toLocalDateTime(row.expected_at) : '—' },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => (
        <StatusBadge
          label={statusLabels[row.status] ?? row.status}
          tone={row.status === 'REPORT_RECEIVED' ? 'success' : row.status === 'CANCELLED' ? 'neutral' : 'warning'}
        />
      ),
    },
    {
      key: 'tests',
      header: 'Ensayos',
      render: (row) => row.tests?.map((link) =>
        link.sample_test?.test?.code ?? link.sample_test_id,
      ).join(', ') ?? '—',
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) => canManage && !['REPORT_RECEIVED', 'CANCELLED'].includes(row.status)
        ? <button className="catalog-file-button" onClick={() => { setShipmentToCancel(row); setCancelReason('') }} type="button">Cancelar</button>
        : '—',
    },
  ]

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!sampleId || !laboratoryId || selectedTestIds.length === 0 || !expectedAt) {
      setError('Seleccione la muestra, el laboratorio, al menos un ensayo e ingrese la fecha esperada.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    setWarnings([])
    try {
      const result = await createExternalShipment({
        sample_id: sampleId,
        laboratory_id: laboratoryId,
        sample_test_ids: selectedTestIds,
        external_code: externalCode.trim() || null,
        sent_at: sentAt ? new Date(sentAt).toISOString() : null,
        expected_at: new Date(expectedAt).toISOString(),
        observations: observations.trim() || null,
      })
      setWarnings(result.accreditation_warnings ?? [])
      setNotice(`Envío registrado (${statusLabels[result.status] ?? result.status}).`)
      setExternalCode('')
      setSentAt('')
      setExpectedAt('')
      setObservations('')
      setSelectedTestIds([])
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el envío.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!shipmentToCancel) return
    if (!cancelReason.trim()) {
      setError('El motivo de cancelación es obligatorio.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await cancelExternalShipment(shipmentToCancel.id, cancelReason)
      setShipmentToCancel(null)
      setNotice('El envío fue cancelado y quedó auditado.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cancelar el envío.')
    } finally {
      setSaving(false)
    }
  }

  const closeCancelModal = useCallback(() => {
    if (!saving) setShipmentToCancel(null)
  }, [saving])

  return (
    <div>
      <PageHeader
        title="Laboratorios externos"
        description="Estructura manualmente los envíos a laboratorios subcontratados y consulta su estado."
      />
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {error && !shipmentToCancel && <ErrorState message={error} />}
      {warnings.length > 0 && (
        <section className="external-warning" aria-label="Advertencias de alcance acreditado" role="status">
          <strong>Advertencia de alcance acreditado</strong>
          <p>El envío se registró. Verifique manualmente estos ensayos; la advertencia no bloquea el proceso.</p>
          <ul>{warnings.map((warning) => (
            <li key={warning.sample_test_id}>
              {warning.test_code ?? warning.sample_test_id}: {warning.message}
            </li>
          ))}</ul>
        </section>
      )}

      {canManage && (
        <section className="external-shipment-form">
          <h2>Estructurar envío desde una muestra</h2>
          <p className="catalog-form-note">
            Las observaciones originales se muestran solo como referencia. No se interpretan automáticamente.
          </p>
          {loading ? <LoadingState message="Cargando opciones de envío…" /> : options && (
            <form className="catalog-form" onSubmit={(event) => void handleCreate(event)}>
              <label>
                Muestra
                <select value={sampleId} onChange={(event) => {
                  setSampleId(event.target.value)
                  setSelectedTestIds([])
                  setLaboratoryId('')
                }} required>
                  <option value="">Seleccione una muestra</option>
                  {options.samples.map((sample) => (
                    <option key={sample.id} value={sample.id}>
                      {sample.code} · {sample.client?.business_name ?? 'Cliente sin nombre'}
                    </option>
                  ))}
                </select>
              </label>
              {selectedSample?.observations && (
                <details>
                  <summary>Ver observaciones originales de la muestra</summary>
                  <p>{selectedSample.observations}</p>
                </details>
              )}
              <label>
                Laboratorio externo
                <select value={laboratoryId} onChange={(event) => {
                  setLaboratoryId(event.target.value)
                  setSelectedTestIds([])
                }} required>
                  <option value="">Seleccione un laboratorio</option>
                  {options.laboratories.map((laboratory) => (
                    <option key={laboratory.id} value={laboratory.id}>{laboratory.code} · {laboratory.name}</option>
                  ))}
                </select>
              </label>
              <fieldset className="external-test-options">
                <legend>Ensayos subcontratados disponibles</legend>
                {!sampleId || !laboratoryId ? (
                  <p>Seleccione una muestra y un laboratorio para consultar los ensayos correspondientes.</p>
                ) : availableTests.length === 0 ? (
                  <p>No hay ensayos subcontratados disponibles para esta muestra y laboratorio.</p>
                ) : availableTests.map((test) => (
                  <label key={test.id}>
                    <input
                      checked={selectedTestIds.includes(test.id)}
                      onChange={(event) => setSelectedTestIds((current) =>
                        event.target.checked
                          ? [...current, test.id]
                          : current.filter((id) => id !== test.id),
                      )}
                      type="checkbox"
                    />
                    {testLabel(test)}
                  </label>
                ))}
              </fieldset>
              <label>
                Fecha y hora de envío (opcional; si se deja vacía, queda pendiente de envío)
                <input type="datetime-local" value={sentAt} onChange={(event) => setSentAt(event.target.value)} />
              </label>
              <div aria-live="polite">
                <span>Estado inicial: </span>
                <StatusBadge
                  label={sentAt ? statusLabels.SENT : statusLabels.PENDING_SEND}
                  tone={sentAt ? 'info' : 'warning'}
                />
              </div>
              <label>
                Fecha esperada del reporte (ingreso manual)
                <input required type="datetime-local" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} />
              </label>
              <label>
                Código externo
                <input value={externalCode} onChange={(event) => setExternalCode(event.target.value)} />
              </label>
              <label>
                Observaciones estructuradas del envío
                <textarea value={observations} onChange={(event) => setObservations(event.target.value)} />
              </label>
              <div className="catalog-form-actions">
                <button className="catalog-primary-button" disabled={saving || loading} type="submit">
                  {saving ? 'Registrando…' : 'Registrar envío'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="external-shipment-list">
        <h2>Envíos registrados</h2>
        {loading ? <LoadingState message="Cargando envíos…" /> :
          rows.length
            ? <DataTable caption="Envíos a laboratorios externos" columns={columns} rowKey={(row) => row.id} rows={rows} />
            : <EmptyState title="No hay envíos registrados" description="Los envíos estructurados aparecerán aquí." />}
      </section>

      <Modal
        open={!!shipmentToCancel}
        title="Cancelar envío externo"
        onClose={closeCancelModal}
      >
        <form className="catalog-form" onSubmit={(event) => void handleCancel(event)}>
          {error && <ErrorState message={error} />}
          <p>La cancelación quedará en el historial de auditoría. Los ensayos podrán vincularse a otro envío activo.</p>
          <label>
            Motivo de cancelación
            <textarea required value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
          </label>
          <div className="catalog-form-actions">
            <button className="catalog-primary-button" disabled={saving} type="submit">
              {saving ? 'Cancelando…' : 'Confirmar cancelación'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
