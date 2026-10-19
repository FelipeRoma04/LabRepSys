export type ImportTarget = 'tests' | 'samples'

export interface ExcelSheetSummary {
  name: string
  rowCount: number
  columnCount: number
}

export interface TargetFieldDef {
  key: string
  label: string
  required: boolean
  description?: string
  aliases: string[]
}

export interface ColumnMapping {
  [targetFieldKey: string]: string // targetField -> sourceColumnName
}

export type IssueSeverity = 'error' | 'warning'

export interface ImportIssue {
  row: number
  field?: string
  message: string
  severity: IssueSeverity
}

export interface ImportRowPreview<T = Record<string, unknown>> {
  rowNumber: number
  data: T
  issues: ImportIssue[]
  isValid: boolean
  requiresManualStructuring?: boolean
}

export interface ImportPreviewResult<T = Record<string, unknown>> {
  target: ImportTarget
  fileName: string
  fileHash: string
  sheetName: string
  totalRows: number
  validCount: number
  errorCount: number
  warningCount: number
  rows: ImportRowPreview<T>[]
  issues: ImportIssue[]
}

export interface ImportExecutionResult {
  importedCount: number
  errorCount: number
  errors: ImportIssue[]
  hash: string
  fileName: string
  requiresManualCount?: number
}
