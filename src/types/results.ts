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
  | 'LEGACY_CODE_NO_MAPPING' | 'INCOMPLETE_TEST_FIELDS'

export type ReconciliationDecision = 'ACCEPT_A' | 'ACCEPT_B' | 'MANUAL' | 'REQUEST_REVIEW'

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
  external_parameter?: string
  external_unit?: string
  external_result?: string
  mapped_test_id?: string
  mapping_status: MappingStatus
  validation_messages?: unknown
  confirmed: boolean
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
  source_page?: number
  entry_mechanism: EntryMechanism
  status: ResultStatus
  entered_by: string
  created_at: string
}

export interface ReconciliationIssue {
  id: string
  sample_id: string
  issue_type: IssueType
  field_name?: string
  entity_type?: string
  entity_id?: string
  source_a?: string
  value_a?: string
  source_b?: string
  value_b?: string
  status: 'OPEN' | 'RESOLVED'
  created_at: string
}
