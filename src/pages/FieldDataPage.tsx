import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../hooks/useAuth'
import {
  formatFileSize,
  normalizeCoordinatePair,
  validateSampleAttachment,
} from '../lib/fieldData'
import {
  getSampleAttachmentSettings,
  getSampleAttachmentSignedUrl,
  getSampleFieldData,
  listFieldParameters,
  listSampleAttachments,
  retireSampleAttachment,
  saveSampleFieldData,
  setPhotoEvidenceEnabled,
  uploadSampleAttachment,
} from '../services/fieldData'
import { listSamples } from '../services/samples'
import type { Sample } from '../types/samples'
import type {
  AttachmentType,
  FieldMeasurement,
  FieldMeasurementDraft,
  FieldParameter,
  SampleAttachment,
  SampleFieldData,
} from '../types/fieldData'

const attachmentTypes: { value: AttachmentType; label: string }[] = [
  { value: 'SOLICITUD', label: 'Solicitud' },
  { value: 'CADENA_CUSTODIA', label: 'Cadena de custodia' },
  { value: 'FORMATO_CAMPO', label: 'Formato de campo' },
  { value: 'FOTO', label: 'Foto' },
  { value: 'OTRO', label: 'Otro' },
]

const stateLabels: Record<FieldMeasurementDraft['value_state'], string> = {
  VALUE: 'Valor registrado',
  NOT_APPLICABLE: 'No aplica',
  NOT_REPORTED: 'No reportado',
  NOT_SPECIFIED: 'No especificado',
  PENDING: 'Pendiente',
}

const emptyFieldData = (): Omit<SampleFieldData, 'sample_id' | 'measurements'> => ({
  latitude_original: '',
  longitude_original: '',
  latitude_normalized: null,
  longitude_normalized: null,
  coordinate_state: 'PENDING',
  collected_by: null,
  notes: '',
})

export function FieldDataPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile, roles } = useAuth()
  const initialSampleId = useRef(searchParams.get('sample_id') ?? '')
  const canEditField = roles.some((role) => role.code === 'MUESTREO')
  const canManageAttachments = roles.some((role) => ['ADMIN', 'RECEPCION'].includes(role.code))
  const canConfigurePhotos = roles.some((role) => role.code === 'ADMIN')
  const canReadAttachments = canManageAttachments ||
    roles.some((role) => ['ANALISTA', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'].includes(role.code))
  const [samples, setSamples] = useState<Sample[]>([])
  const [parameters, setParameters] = useState<FieldParameter[]>([])
  const [attachments, setAttachments] = useState<SampleAttachment[]>([])
  const [attachmentSettings, setAttachmentSettings] = useState<{
    maxSizeBytes: number
    photoEvidenceEnabled: boolean
  } | null>(null)
  const [selectedSampleId, setSelectedSampleId] = useState(initialSampleId.current)
  const [fieldData, setFieldData] = useState(emptyFieldData)
  const [measurements, setMeasurements] = useState<Record<string, FieldMeasurementDraft>>({})
  const [attachmentType, setAttachmentType] = useState<AttachmentType>('SOLICITUD')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null)
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [editReason, setEditReason] = useState('')
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [updatingPhotoSetting, setUpdatingPhotoSetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedSample = useMemo(
    () => samples.find((sample) => sample.id === selectedSampleId) ?? null,
    [samples, selectedSampleId],
  )
  const reasonRequired = selectedSample !== null && selectedSample.status !== 'PENDING_REVIEW'
  const coordinates = normalizeCoordinatePair(
    fieldData.latitude_original ?? '',
    fieldData.longitude_original ?? '',
  )

  const loadSamplesAndCatalog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sampleRows, parameterRows, settings] = await Promise.all([
        listSamples(),
        listFieldParameters(),
        canReadAttachments ? getSampleAttachmentSettings() : Promise.resolve(null),
      ])
      setSamples(sampleRows)
      setParameters(parameterRows)
      setAttachmentSettings(settings)
      const requestedSample = sampleRows.find((sample) => sample.id === initialSampleId.current)
      const chosen = requestedSample?.id ?? sampleRows[0]?.id ?? ''
      setDetailLoading(Boolean(chosen))
      setSelectedSampleId(chosen)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los datos de campo.')
    } finally {
      setLoading(false)
    }
  }, [canReadAttachments])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSamplesAndCatalog(), 0)
    return () => window.clearTimeout(timer)
  }, [loadSamplesAndCatalog])

  const loadSelectedSampleData = useCallback(async () => {
    if (!selectedSampleId) {
      setAttachments([])
      setFieldData(emptyFieldData())
      setMeasurements({})
      return
    }
    setDetailLoading(true)
    setError(null)
    try {
      const [savedFieldData, attachmentRows] = await Promise.all([
        getSampleFieldData(selectedSampleId),
        canReadAttachments ? listSampleAttachments(selectedSampleId) : Promise.resolve([]),
      ])
      setFieldData(savedFieldData ? {
        latitude_original: savedFieldData.latitude_original ?? '',
        longitude_original: savedFieldData.longitude_original ?? '',
        latitude_normalized: savedFieldData.latitude_normalized,
        longitude_normalized: savedFieldData.longitude_normalized,
        coordinate_state: savedFieldData.coordinate_state,
        collected_by: savedFieldData.collected_by,
        notes: savedFieldData.notes ?? '',
      } : emptyFieldData())
      setAttachments(attachmentRows)
      setMeasurements(Object.fromEntries(parameters.map((parameter) => {
        const existing = savedFieldData?.measurements.find(
          (item) => item.field_parameter_id === parameter.id,
        )
        return [parameter.id, {
          value_state: existing?.value_state ?? 'PENDING',
          numeric_value: existing?.numeric_value === null || existing?.numeric_value === undefined
            ? ''
            : String(existing.numeric_value),
          unit: existing?.unit ?? parameter.default_unit ?? '',
        }]
      })))
      setSignedUrls({})
      setWithdrawalId(null)
      setWithdrawalReason('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los datos de la muestra.')
    } finally {
      setDetailLoading(false)
    }
  }, [canReadAttachments, parameters, selectedSampleId])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSelectedSampleData(), 0)
    return () => window.clearTimeout(timer)
  }, [loadSelectedSampleData])

  const changeSample = (sampleId: string) => {
    setSelectedSampleId(sampleId)
    setFieldData(emptyFieldData())
    setMeasurements({})
    setAttachments([])
    setDetailLoading(true)
    setEditReason('')
    setNotice(null)
    setSearchParams(sampleId ? { sample_id: sampleId } : {}, { replace: true })
  }

  const updateMeasurement = (
    parameterId: string,
    patch: Partial<FieldMeasurementDraft>,
  ) => {
    setMeasurements((current) => ({
      ...current,
      [parameterId]: { ...current[parameterId], ...patch },
    }))
  }

  const saveFieldData = async () => {
    if (!selectedSample || !canEditField) return
    setError(null)
    setNotice(null)
    if (coordinates.state === 'INVALID') {
      setError('Las coordenadas están fuera de rango o tienen un formato DMS inválido.')
      return
    }
    if (reasonRequired && !editReason.trim()) {
      setError('Indica el motivo de edición requerido después de la recepción.')
      return
    }
    const fieldMeasurements: FieldMeasurement[] = []
    for (const parameter of parameters) {
      const draft = measurements[parameter.id]
      if (!draft) continue
      if (draft.value_state === 'VALUE') {
        if (!draft.numeric_value.trim()) {
          setError(`Registra un valor numérico para ${parameter.name} o selecciona otro estado.`)
          return
        }
        const numberValue = Number(draft.numeric_value.replace(',', '.'))
        if (!Number.isFinite(numberValue)) {
          setError(`El valor de ${parameter.name} no es numérico.`)
          return
        }
        fieldMeasurements.push({
          field_parameter_id: parameter.id,
          value_state: 'VALUE',
          numeric_value: numberValue,
          unit: draft.unit || null,
          original_text: draft.numeric_value,
        })
      } else {
        fieldMeasurements.push({
          field_parameter_id: parameter.id,
          value_state: draft.value_state,
          numeric_value: null,
          unit: draft.unit || null,
          original_text: null,
        })
      }
    }
    setSaving(true)
    try {
      await saveSampleFieldData(
        selectedSample.id,
        {
          ...fieldData,
          latitude_normalized: coordinates.latitude.state === 'NORMALIZED'
            ? coordinates.latitude.value
            : null,
          longitude_normalized: coordinates.longitude.state === 'NORMALIZED'
            ? coordinates.longitude.value
            : null,
          coordinate_state: coordinates.state,
          collected_by: profile?.id ?? fieldData.collected_by,
        },
        fieldMeasurements,
        editReason,
      )
      setNotice('Los datos de campo se guardaron correctamente.')
      setEditReason('')
      await loadSelectedSampleData()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los datos de campo.')
    } finally {
      setSaving(false)
    }
  }

  const chooseAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    setError(null)
    setNotice(null)
    if (!file) {
      setAttachmentFile(null)
      return
    }
    if (attachmentSettings) {
      const validationError = validateSampleAttachment(
        file,
        attachmentSettings.maxSizeBytes,
        attachmentSettings.photoEvidenceEnabled,
        attachmentType,
      )
      if (validationError) {
        setAttachmentFile(null)
        setError(validationError)
        return
      }
    }
    setAttachmentFile(file)
  }

  const uploadAttachment = async () => {
    if (!selectedSample || !attachmentFile || !attachmentSettings || !canManageAttachments) return
    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      await uploadSampleAttachment(
        selectedSample.id,
        attachmentFile,
        attachmentType,
        attachmentSettings.maxSizeBytes,
        attachmentSettings.photoEvidenceEnabled,
      )
      setAttachmentFile(null)
      setNotice('El adjunto se cargó correctamente.')
      await loadSelectedSampleData()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el adjunto.')
    } finally {
      setUploading(false)
    }
  }

  const requestDownload = async (attachment: SampleAttachment) => {
    setError(null)
    try {
      const url = await getSampleAttachmentSignedUrl(attachment.storage_path)
      setSignedUrls((current) => ({ ...current, [attachment.id]: url }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo preparar la descarga.')
    }
  }

  const changePhotoEvidenceSetting = async (enabled: boolean) => {
    if (!canConfigurePhotos || !attachmentSettings) return
    setUpdatingPhotoSetting(true)
    setError(null)
    try {
      await setPhotoEvidenceEnabled(enabled)
      setAttachmentSettings((current) => current ? { ...current, photoEvidenceEnabled: enabled } : current)
      setNotice(`La carga de fotos como evidencia quedó ${enabled ? 'habilitada' : 'deshabilitada'}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración de fotos.')
    } finally {
      setUpdatingPhotoSetting(false)
    }
  }

  const withdrawAttachment = async (attachmentId: string) => {
    if (!withdrawalReason.trim()) {
      setError('Escribe el motivo para retirar el adjunto.')
      return
    }
    setError(null)
    try {
      await retireSampleAttachment(attachmentId, withdrawalReason)
      setNotice('El adjunto fue marcado como retirado. El archivo se conserva en Storage.')
      await loadSelectedSampleData()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo retirar el adjunto.')
    }
  }

  if (loading) return <LoadingState message="Cargando datos de campo…" />

  return (
    <>
      <PageHeader
        title="Datos de campo y adjuntos"
        description="Registro de mediciones, coordenadas y archivos asociados a una muestra."
      />
      {error && <ErrorState message={error} />}
      {notice && <p className="catalog-notice" role="status">{notice}</p>}
      {!samples.length
        ? <EmptyState title="No hay muestras disponibles" description="Registra o consulta una muestra antes de cargar datos de campo." />
        : <>
          <div className="fielddata-sample-picker">
            <label htmlFor="fielddata-sample">Muestra</label>
            <select
              id="fielddata-sample"
              onChange={(event) => changeSample(event.target.value)}
              value={selectedSampleId}
            >
              {samples.map((sample) => (
                <option key={sample.id} value={sample.id}>{sample.code} · {sample.client?.business_name ?? 'Cliente'}</option>
              ))}
            </select>
            {selectedSample && <p>Estado: {selectedSample.status === 'PENDING_REVIEW' ? 'Pendiente de revisión' : 'Recibida'}</p>}
          </div>

          {selectedSample && (detailLoading
            ? <LoadingState message="Cargando información de la muestra…" />
            : <>
            <section className="fielddata-section" aria-labelledby="fielddata-title">
              <h2 id="fielddata-title">Registro de campo</h2>
              {!canEditField && <p className="catalog-form-note">Tu rol permite consultar estos datos, pero no editarlos.</p>}
              <div className="fielddata-grid">
                <label>Latitud original
                  <input
                    autoComplete="off"
                    inputMode="text"
                    onChange={(event) => setFieldData((current) => ({ ...current, latitude_original: event.target.value }))}
                    placeholder="Ej.: 4.7110 o 4°42'39.6&quot;N"
                    value={fieldData.latitude_original ?? ''}
                  />
                </label>
                <label>Longitud original
                  <input
                    autoComplete="off"
                    inputMode="text"
                    onChange={(event) => setFieldData((current) => ({ ...current, longitude_original: event.target.value }))}
                    placeholder="Ej.: -74.0721 o 74°4'19.6&quot;W"
                    value={fieldData.longitude_original ?? ''}
                  />
                </label>
              </div>
              {coordinates.state === 'AMBIGUOUS' && (fieldData.latitude_original || fieldData.longitude_original) &&
                <p className="fielddata-warning" role="status">No se pudo normalizar el formato de coordenadas. Se conservará el texto original.</p>}
              {coordinates.state === 'INVALID' &&
                <p className="fielddata-error" role="alert">Coordenada inválida o fuera de rango: latitud −90 a 90 y longitud −180 a 180.</p>}
              {coordinates.state === 'NORMALIZED' &&
                <p className="fielddata-coordinate-result">Coordenadas decimales: {coordinates.latitude.value}, {coordinates.longitude.value}</p>}
              <label>Notas de campo
                <textarea
                  onChange={(event) => setFieldData((current) => ({ ...current, notes: event.target.value }))}
                  value={fieldData.notes ?? ''}
                />
              </label>
              <h3>Mediciones</h3>
              {!parameters.length && <p>No hay parámetros de campo activos configurados.</p>}
              {parameters.map((parameter) => {
                const draft = measurements[parameter.id] ?? {
                  value_state: 'PENDING' as const,
                  numeric_value: '',
                  unit: parameter.default_unit ?? '',
                }
                return (
                  <fieldset className="fielddata-measurement" key={parameter.id}>
                    <legend>{parameter.name}</legend>
                    <label>Estado
                      <select
                        aria-label={`Estado de ${parameter.name}`}
                        disabled={!canEditField}
                        onChange={(event) => updateMeasurement(parameter.id, {
                          value_state: event.target.value as FieldMeasurementDraft['value_state'],
                        })}
                        value={draft.value_state}
                      >
                        {Object.entries(stateLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    {draft.value_state === 'VALUE' && <>
                      <label>Valor numérico
                        <input
                          aria-label={`Valor de ${parameter.name}`}
                          disabled={!canEditField}
                          inputMode="decimal"
                          onChange={(event) => updateMeasurement(parameter.id, { numeric_value: event.target.value })}
                          value={draft.numeric_value}
                        />
                      </label>
                      <label>Unidad
                        <input
                          aria-label={`Unidad de ${parameter.name}`}
                          disabled={!canEditField}
                          onChange={(event) => updateMeasurement(parameter.id, { unit: event.target.value })}
                          value={draft.unit}
                        />
                      </label>
                    </>}
                  </fieldset>
                )
              })}
              {reasonRequired && <label>Motivo de edición posterior a la recepción
                <textarea
                  disabled={!canEditField}
                  onChange={(event) => setEditReason(event.target.value)}
                  value={editReason}
                />
              </label>}
              {canEditField && <div className="catalog-form-actions">
                <button className="catalog-primary-button" disabled={saving} onClick={() => void saveFieldData()} type="button">
                  {saving ? 'Guardando…' : 'Guardar datos de campo'}
                </button>
              </div>}
            </section>

            <section className="fielddata-section" aria-labelledby="attachments-title">
              <h2 id="attachments-title">Adjuntos</h2>
              {canReadAttachments
                ? <>
                  {canManageAttachments && attachmentSettings && <div className="fielddata-upload">
                    <label>Tipo de adjunto
                      <select
                        onChange={(event) => {
                          setAttachmentType(event.target.value as AttachmentType)
                          setAttachmentFile(null)
                        }}
                        value={attachmentType}
                      >
                        {attachmentTypes.map((item) => (
                          <option
                            disabled={item.value === 'FOTO' && !attachmentSettings.photoEvidenceEnabled}
                            key={item.value}
                            value={item.value}
                          >{item.label}{item.value === 'FOTO' && !attachmentSettings.photoEvidenceEnabled ? ' (deshabilitada)' : ''}</option>
                        ))}
                      </select>
                    </label>
                    <label>Archivo (PDF, JPG, PNG, CSV o XLSX; máximo {formatFileSize(attachmentSettings.maxSizeBytes)})
                      <input
                        accept=".pdf,.jpg,.jpeg,.png,.csv,.xlsx"
                        onChange={chooseAttachment}
                        type="file"
                      />
                    </label>
                    {attachmentFile && <p>Seleccionado: {attachmentFile.name} · {formatFileSize(attachmentFile.size)}</p>}
                    <button
                      className="catalog-primary-button"
                      disabled={!attachmentFile || uploading}
                      onClick={() => void uploadAttachment()}
                      type="button"
                    >{uploading ? 'Cargando…' : 'Cargar adjunto'}</button>
                    {canConfigurePhotos && <label className="fielddata-switch">
                      <input
                        checked={attachmentSettings.photoEvidenceEnabled}
                        disabled={updatingPhotoSetting}
                        onChange={(event) => void changePhotoEvidenceSetting(event.target.checked)}
                        type="checkbox"
                      />
                      Permitir fotos como evidencia (RF-CAM-005)
                    </label>}
                  </div>}
                  {attachments.length
                    ? <ul className="fielddata-attachments">
                      {attachments.map((attachment) => (
                        <li key={attachment.id}>
                          <div>
                            <strong>{attachment.file_name}</strong>
                            <span>{attachmentTypes.find((item) => item.value === attachment.attachment_type)?.label ?? attachment.attachment_type} · {formatFileSize(attachment.file_size)} · SHA-256 {attachment.sha256}</span>
                            {attachment.withdrawn && <span className="fielddata-warning">Retirado: {attachment.withdrawn_reason}</span>}
                          </div>
                          {!attachment.withdrawn && <div className="fielddata-attachment-actions">
                            <button onClick={() => void requestDownload(attachment)} type="button">Preparar descarga</button>
                            {signedUrls[attachment.id] && <a href={signedUrls[attachment.id]} rel="noreferrer" target="_blank">Descargar (enlace válido 60 s)</a>}
                            {canManageAttachments && <button onClick={() => setWithdrawalId(attachment.id)} type="button">Retirar</button>}
                          </div>}
                          {canManageAttachments && withdrawalId === attachment.id && <div className="fielddata-withdraw">
                            <label>Motivo de retiro
                              <input onChange={(event) => setWithdrawalReason(event.target.value)} value={withdrawalReason} />
                            </label>
                            <button onClick={() => void withdrawAttachment(attachment.id)} type="button">Confirmar retiro</button>
                            <button onClick={() => setWithdrawalId(null)} type="button">Cancelar</button>
                          </div>}
                        </li>
                      ))}
                    </ul>
                    : <p>No hay adjuntos registrados.</p>}
                </>
                : <p>Tu rol no tiene permiso para consultar adjuntos de muestra.</p>}
            </section>
          </>)}
        </>}
    </>
  )
}
