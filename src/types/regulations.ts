export type RegulationVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED'
export type RegulationDischargeType = 'ARD' | 'ARnD' | 'NA'
export type RegulationSpecialValue =
  | 'N_A'
  | 'N_E'
  | 'N_R'
  | 'NOT_SPECIFIED'
  | 'ANALYSIS_AND_REPORT'
  | 'NONE'

export interface Regulation {
  id: string
  code: string
  name: string
  source_reference: string | null
}

export interface RegulationVersion {
  id: string
  regulation_id: string
  version_name: string
  valid_from: string | null
  valid_until: string | null
  status: RegulationVersionStatus
}

export interface RegulationActivity {
  id: string
  regulation_version_id: string
  article: string
  activity: string
  discharge_type: RegulationDischargeType | null
  description: string | null
}

export interface RegulationLimit {
  id: string
  activity_id: string
  test_id: string
  limit_operator: '<' | '<=' | '>' | '>=' | '=' | null
  limit_value: number | null
  limit_text: string | null
  unit: string | null
  special_value: RegulationSpecialValue | null
  test?: { code: string; parameter_name: string | null } | null
}

export interface SampleRegulation {
  id: string
  sample_id: string
  regulation_version_id: string
  activity_id: string | null
  source: 'QUOTE' | 'MANUAL'
  suggested_from_quote_id: string | null
  confirmed: boolean
  confirmed_at: string | null
  column_order: number
  decision_reason: string | null
  version?: { version_name: string; regulation?: { name: string } | null } | null
  activity?: RegulationActivity | null
}

export interface RegulationCsvRow {
  row_number: number
  article: string
  activity: string
  discharge_type: RegulationDischargeType
  description: string
  test_code: string
  limit_operator: string
  limit_value: string
  limit_text: string
  unit: string
  special_value: string
}

export interface RegulationCsvError {
  row: number
  message: string
}

export interface RegulationSample {
  id: string
  code: string
  quote_id: string | null
  quote?: { code: string } | null
  matrix?: { code: string; name: string } | null
  reception?: { request_review: Record<string, unknown> } | null
}

export interface QuoteRegulationSuggestion {
  regulation_name: string
  article: string | null
  activity: string | null
  discharge_type: RegulationDischargeType
}
