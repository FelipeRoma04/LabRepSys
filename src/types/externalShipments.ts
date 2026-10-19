import type { Sample } from './samples'

export type ExternalShipmentStatus =
  | 'PENDING_SEND'
  | 'SENT'
  | 'REPORT_RECEIVED'
  | 'CANCELLED'

export interface ExternalLaboratory {
  id: string
  code: string
  name: string
}

export interface ExternalShipmentTestLink {
  sample_test_id: string
  sample_test?: { test?: { code: string } | null } | null
}

export interface ExternalShipment {
  id: string
  sample_id: string
  laboratory_id: string
  external_code: string | null
  sent_at: string | null
  expected_at: string | null
  report_received_at: string | null
  received_by: string | null
  status: ExternalShipmentStatus
  observations: string | null
  created_at: string
  laboratory?: { name: string } | null
  sample?: {
    code: string
    sampling_point: string | null
    client?: { business_name: string } | null
  } | null
  tests?: ExternalShipmentTestLink[]
}

export interface PendingExternalReport {
  shipment_id: string
  sample_id: string
  sample_code: string
  client_id: string
  client_name: string
  sampling_point: string | null
  laboratory_id: string
  laboratory_name: string
  external_code: string | null
  sent_at: string | null
  expected_at: string | null
  status: Exclude<ExternalShipmentStatus, 'REPORT_RECEIVED' | 'CANCELLED'>
  days_overdue: number | null
  observations: string | null
}

export interface ExternalShipmentOptions {
  samples: Sample[]
  laboratories: ExternalLaboratory[]
  attachedSampleTestIds: string[]
}

export interface CreateExternalShipmentInput {
  sample_id: string
  laboratory_id: string
  sample_test_ids: string[]
  external_code: string | null
  sent_at: string | null
  expected_at: string
  observations: string | null
}

export interface AccreditationWarning {
  sample_test_id: string
  test_code: string | null
  analysis_date?: string
  message: string
}

export interface CreateExternalShipmentResult {
  ok: boolean
  shipment_id: string
  status: ExternalShipmentStatus
  accreditation_warnings: AccreditationWarning[]
}
