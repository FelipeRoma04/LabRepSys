export type SampleExecutionType = 'SA' | 'SUBCONTRACTED'

export interface Sample {
  id: string
  code: string
  client_id: string
  quote_id: string | null
  matrix_id: string | null
  plan_code: string | null
  sampling_point: string | null
  sampled_at: string | null
  received_at: string
  status: string
  observations: string | null
  client?: { business_name: string; nit: string | null } | null
  quote?: { code: string } | null
  matrix?: { code: string; name: string } | null
  reception?: SampleReception | null
  tests?: SampleTestDetail[]
  events?: SampleEvent[]
}

export interface SampleReception {
  sample_id: string
  containers: { type: string; quantity: string }[]
  preservation: Record<string, string>
  received_by: string
  chain_of_custody_verified: boolean
  arrival_conditions: string | null
  deviations: string | null
  client_consulted_on_deviation: boolean
  request_review: Record<string, unknown>
  signature_reference: string | null
}

export interface SampleTest {
  test_id: string
  execution_type: SampleExecutionType
  assigned_laboratory_id: string | null
}

export interface SampleTestDetail extends SampleTest {
  id: string
  status: string
  test?: { code: string; parameter_name: string | null } | null
  laboratory?: { name: string } | null
}

export interface SampleEvent {
  id: string
  event_type: string
  detail: Record<string, unknown>
  created_at: string
}

export interface SamplePayload {
  code: string
  client_id: string
  quote_id: string | null
  quote_suggestions_confirmed: boolean
  suggested_regulations: unknown[]
  matrix_id: string | null
  plan_code: string | null
  sampling_point: string | null
  sampled_at: string | null
  received_at: string
  observations: string | null
  containers: { type: string; quantity: string }[]
  preservation: Record<string, string>
  reception: {
    chain_of_custody_verified: boolean
    arrival_conditions: string | null
    has_deviation: boolean
    deviations: string | null
    client_consulted_on_deviation: boolean
    signature_reference: string | null
  }
  request_review: {
    capacity_verified: boolean
    methods_verified: boolean
    conformity_requested: boolean
    decision_rule: string | null
  }
  tests: SampleTest[]
}

export interface SampleCatalogOptions {
  matrices: { id: string; code: string; name: string }[]
  tests: { id: string; code: string; parameter_name: string | null }[]
  laboratories: { id: string; code: string; name: string; laboratory_type: string }[]
  accreditedScopes: {
    test_id: string
    laboratory_id: string
    valid_from: string | null
    valid_until: string | null
    active: boolean
  }[]
  codePattern: string
}
