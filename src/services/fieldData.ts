import { createStorageSignedUrl } from './storage'
import { supabase } from '../lib/supabase'
import {
  getSampleFileType,
  sanitizeFileName,
  sha256File,
  validateSampleAttachment,
} from '../lib/fieldData'
import type {
  AttachmentType,
  FieldMeasurement,
  FieldParameter,
  SampleAttachment,
  SampleFieldData,
} from '../types/fieldData'

const maxAttachmentSizeSetting = 'sample.field.max_attachment_size_bytes'
const photoEvidenceSetting = 'sample.field.photo_evidence_enabled'

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

export async function listFieldParameters(): Promise<FieldParameter[]> {
  const { data, error } = await db()
    .from('field_parameters')
    .select('id, code, name, default_unit, active')
    .eq('active', true)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function getSampleFieldData(sampleId: string): Promise<SampleFieldData | null> {
  const { data, error } = await db()
    .from('sample_field_data')
    .select('*, measurements:sample_field_measurements(field_parameter_id, value_state, numeric_value, unit, original_text)')
    .eq('sample_id', sampleId)
    .maybeSingle()
  if (error) throw error
  return data as SampleFieldData | null
}

export async function listSampleAttachments(sampleId: string): Promise<SampleAttachment[]> {
  const { data, error } = await db()
    .from('sample_attachments')
    .select('*')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getSampleAttachmentSettings(): Promise<{
  maxSizeBytes: number
  photoEvidenceEnabled: boolean
}> {
  const { data, error } = await db()
    .from('app_settings')
    .select('key, value')
    .in('key', [maxAttachmentSizeSetting, photoEvidenceSetting])
  if (error) throw error

  const settings = new Map((data ?? []).map((item) => [item.key, item.value]))
  const maxSize = settings.get(maxAttachmentSizeSetting)
  const photoEvidence = settings.get(photoEvidenceSetting)
  if (
    typeof maxSize !== 'number' ||
    !Number.isSafeInteger(maxSize) ||
    maxSize <= 0 ||
    typeof photoEvidence !== 'boolean'
  ) {
    throw new Error('La configuración de tamaño máximo o de fotos no está disponible.')
  }
  return { maxSizeBytes: maxSize, photoEvidenceEnabled: photoEvidence }
}

export async function setPhotoEvidenceEnabled(enabled: boolean): Promise<void> {
  const { error } = await db()
    .from('app_settings')
    .update({ value: enabled })
    .eq('key', photoEvidenceSetting)
  if (error) throw error
}

export async function saveSampleFieldData(
  sampleId: string,
  fieldData: Omit<SampleFieldData, 'sample_id' | 'measurements'>,
  measurements: FieldMeasurement[],
  reason: string,
): Promise<void> {
  const { error } = await db().rpc('save_sample_field_data', {
    target_sample_id: sampleId,
    field_data: fieldData,
    field_measurements: measurements,
    edit_reason: reason.trim() || null,
  })
  if (error) throw error
}

export async function uploadSampleAttachment(
  sampleId: string,
  file: File,
  attachmentType: AttachmentType,
  maxSizeBytes: number,
  photoEvidenceEnabled: boolean,
): Promise<void> {
  const validationError = validateSampleAttachment(
    file,
    maxSizeBytes,
    photoEvidenceEnabled,
    attachmentType,
  )
  if (validationError) throw new Error(validationError)
  const fileType = getSampleFileType(file.name, file.type)
  if (!fileType) throw new Error('Tipo de archivo no permitido.')

  const fileName = sanitizeFileName(file.name)
  const storagePath = `samples/${sampleId}/${crypto.randomUUID()}-${fileName}`
  const sha256 = await sha256File(file)
  const { error: uploadError } = await db()
    .storage
    .from('source-files')
    .upload(storagePath, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError

  const { error: registerError } = await db().rpc('register_sample_attachment', {
    target_sample_id: sampleId,
    target_attachment_type: attachmentType,
    target_storage_path: storagePath,
    target_file_name: file.name,
    target_file_type: fileType,
    target_file_size: file.size,
    target_sha256: sha256,
  })
  if (registerError) throw registerError
}

export async function retireSampleAttachment(
  attachmentId: string,
  reason: string,
): Promise<void> {
  const { error } = await db().rpc('retire_sample_attachment', {
    target_attachment_id: attachmentId,
    withdrawal_reason: reason,
  })
  if (error) throw error
}

export async function getSampleAttachmentSignedUrl(storagePath: string): Promise<string> {
  return createStorageSignedUrl('source-files', storagePath)
}
