/**
 * Tipos para reportes RSA, flujo de aprobación y snapshots.
 * p11, p12
 */

export type ReportStatus =
  | 'DRAFT' | 'VALIDATING' | 'READY_FOR_REVIEW' | 'IN_REVIEW'
  | 'RETURNED' | 'APPROVED' | 'ISSUED' | 'RECTIFIED' | 'VOIDED'

export interface Report {
  id: string
  code?: string
  version: number
  status: ReportStatus
  client_id?: string
  contact_id?: string
  template_id?: string
  prepared_by: string
  reviewed_by?: string
  approved_by?: string
  issued_at?: string
  replaces_report_id?: string
  rectification_reason?: string
  created_at: string
  updated_at: string
}

export interface ReportSample {
  id: string
  report_id: string
  sample_id: string
}

export interface ReportResult {
  id: string
  report_id: string
  result_id: string
  display_order: number
  group_label?: string
}

export interface ReportReview {
  id: string
  report_id: string
  reviewer_id: string
  decision: 'ACCEPTED' | 'RETURNED' | 'APPROVED'
  comments?: string
  created_at: string
}

export interface ReportSnapshot {
  id: string
  report_id: string
  snapshot_data: unknown
  snapshot_hash: string
  created_at: string
}

export interface TransitionResult {
  ok: boolean
  error_code?: string
  message?: string
  new_status?: string
}

/** Etiquetas en español para los estados del RSA */
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  DRAFT:            'Borrador',
  VALIDATING:       'Validando',
  READY_FOR_REVIEW: 'Listo para revisión',
  IN_REVIEW:        'En revisión',
  RETURNED:         'Devuelto',
  APPROVED:         'Aprobado',
  ISSUED:           'Emitido',
  RECTIFIED:        'Rectificado',
  VOIDED:           'Anulado',
}
