export const fieldValueStates = [
  'VALUE',
  'NOT_APPLICABLE',
  'NOT_REPORTED',
  'NOT_SPECIFIED',
  'PENDING',
] as const

export type FieldValueState = (typeof fieldValueStates)[number]

export interface FieldParameter {
  id: string
  code: string
  name: string
  default_unit: string | null
  active: boolean
}

export interface FieldMeasurement {
  field_parameter_id: string
  value_state: FieldValueState
  numeric_value: number | null
  unit: string | null
  original_text: string | null
}

export interface SampleFieldData {
  sample_id: string
  latitude_original: string | null
  longitude_original: string | null
  latitude_normalized: number | null
  longitude_normalized: number | null
  coordinate_state: 'NORMALIZED' | 'AMBIGUOUS' | 'INVALID' | 'PENDING'
  collected_by: string | null
  notes: string | null
  measurements: FieldMeasurement[]
}

export type AttachmentType =
  | 'SOLICITUD'
  | 'CADENA_CUSTODIA'
  | 'FORMATO_CAMPO'
  | 'FOTO'
  | 'OTRO'

export interface SampleAttachment {
  id: string
  sample_id: string
  attachment_type: AttachmentType
  storage_path: string
  file_name: string
  file_type: 'pdf' | 'jpg' | 'jpeg' | 'png' | 'csv' | 'xlsx'
  file_size: number
  sha256: string
  uploaded_by: string
  withdrawn: boolean
  withdrawn_reason: string | null
  created_at: string
}

export interface FieldMeasurementDraft {
  value_state: FieldValueState
  numeric_value: string
  unit: string
}
