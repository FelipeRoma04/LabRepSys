export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO'
export type ValidationEntityType = 'SAMPLE' | 'REPORT'

export interface ValidationRule {
  code: string
  description: string
  severity: ValidationSeverity
  blocking: boolean
  entity_type: ValidationEntityType
}

export interface ValidationRun {
  id: string
  entity_type: ValidationEntityType
  entity_id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  executed_by: string | null
  executed_at: string
}

export interface ValidationIssue {
  id: string
  validation_run_id: string
  rule_code: string
  severity: ValidationSeverity
  field_name: string | null
  message: string
  blocking: boolean
  resolved: boolean
  resolution: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  rule: ValidationRule | null
  run: ValidationRun
}
