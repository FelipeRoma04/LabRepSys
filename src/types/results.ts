/**
 * Tipos para resultados de laboratorio, importaciones y conciliación.
 * p07, p08
 */

export type ValueState = 'VALUE' | 'NOT_APPLICABLE' | 'NOT_REPORTED' | 'NOT_SPECIFIED' | 'PENDING'
export type ResultOperator = '<' | '<=' | '>' | '>=' | '='
export type ImportSourceType = 'PDF' | 'PASTE' | 'MANUAL'
export type ImportStatus = 'PENDING' | 'PROCESSING' | 'PARTIAL' | 'COMPLETED' | 'FAILED'
export type MappingStatus = 'EXACT' | 'SUGGESTED' | 'UNMAPPED' | 'CONFIRMED'
export type ResultStatus = 'IMPORTED' | 'CONFIRMED' | 'CORRECTED' | 'REJECTED'
export type EntryMechanism = 'IMPORTED' | 'PASTE' | 'MANUAL'

export type IssueType =
  | 'DATE_MISMATCH' | 'MATRIX_MISMATCH' | 'UNREQUESTED_PARAMETER'
  | 'MISSING_RESULT' | 'LCM_MISMATCH' | 'METHOD_MISMATCH' | 'UNIT_MISMATCH'
  | 'TECHNIQUE_MISMATCH' | 'DUPLICATE_RESULT' | 'LAB_DEVIATION'
  | 'LEGACY_CODE_NO_MAPPING' | 'INCOMPLETE_TEST_FIELDS' | 'EXTERNAL_REPORT_PENDING'
  | 'REGULATION_MISMATCH'

export type ReconciliationDecision = 'ACCEPT_A' | 'ACCEPT_B' | 'MANUAL' | 'REQUEST_REVIEW'
export type ReconciliationStatus = 'OPEN' | 'RESOLVED'

export interface ResultImport {
  id: string
  sample_id: string
  laboratory_id: string
  source_type: ImportSourceType
  storage_path?: string
  file_name?: string
  file_hash?: string
  adapter_code?: string
  adapter_version?: string
  import_status: ImportStatus
  raw_payload?: unknown
  created_at: string
}

export interface ImportRow {
  id: string
  result_import_id: string
  row_number: number
  external_parameter?: string | null
  external_unit?: string | null
  external_result?: string | null
  external_uncertainty?: string | null
  external_lcm?: number | null
  external_method?: string | null
  external_technique?: string | null
  analysis_start?: string | null
  analysis_end?: string | null
  mapped_test_id?: string | null
  mapping_status: MappingStatus
  validation_messages?: unknown
  confirmed: boolean
}

export interface ResultImportRowDraft {
  external_parameter: string
  external_unit: string | null
  external_result: string
  external_uncertainty?: string | null
  external_lcm?: number | null
  external_method?: string | null
  external_technique?: string | null
  analysis_start?: string | null
  analysis_end?: string | null
  mapped_test_id: string | null
  mapping_status: Exclude<MappingStatus, 'CONFIRMED'>
  validation_messages: string[]
}

export interface Result {
  id: string
  sample_id: string
  test_id: string
  laboratory_id: string
  operator?: ResultOperator
  numeric_value?: number
  original_text?: string
  reported_text?: string
  unit?: string
  lcm?: number
  uncertainty_text?: string
  method_text?: string
  technique_text?: string
  accreditation_type?: 'ACCREDITED' | 'NOT_ACCREDITED' | 'NOT_APPLICABLE'
  analysis_start?: string
  analysis_end?: string
  source_import_id?: string
  source_import_row_id?: string | null
  source_page?: number
  entry_mechanism: EntryMechanism
  status: ResultStatus
  entered_by: string
  created_at: string
}

export interface ResultCorrection {
  id: string
  result_id: string
  old_data: Record<string, unknown>
  new_data: Record<string, unknown>
  reason: string
  corrected_by: string
  created_at: string
}

export interface PendingResult {
  sample_id: string
  sample_code: string
  client_name: string
  sample_test_id: string
  test_id: string
  test_code: string
  parameter_name: string | null
  laboratory_id: string | null
  laboratory_name: string | null
}

export interface ResultLoadOptions {
  samples: {
    id: string
    code: string
    client_name: string
  }[]
  laboratories: {
    id: string
    code: string
    name: string
  }[]
  tests: {
    id: string
    code: string
    parameter_name: string | null
  }[]
  aliases: {
    test_id: string
    laboratory_id: string | null
    external_name: string
  }[]
}

export interface ReconciliationIssue {
  id: string
  sample_id: string | null
  issue_type: IssueType
  field_name?: string
  entity_type?: string
  entity_id?: string
  related_entity_id?: string | null
  source_a?: string | null
  value_a?: string | null
  source_b?: string | null
  value_b?: string | null
  source_c?: string | null
  value_c?: string | null
  source_page?: number | null
  storage_path?: string | null
  is_demo: boolean
  demo_sample_code?: string | null
  sample?: { code: string } | null
  decisions?: ReconciliationIssueDecision[]
  status: ReconciliationStatus
  created_at: string
}

export interface ReconciliationIssueDecision {
  id: string
  issue_id: string
  selected_source: string | null
  selected_value: string | null
  decision: ReconciliationDecision
  reason: string
  decided_by: string
  created_at: string
}

export interface ReconciliationOptions {
  samples: { id: string; code: string }[]
  tests: { id: string; code: string; parameter_name: string | null }[]
}
