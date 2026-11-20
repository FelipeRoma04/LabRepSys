/**
 * Modelo del "REPORTE DE RESULTADOS" (formato SA-OP-LAA-TEC-FOR.6.1).
 * Caso de referencia: RSA 0106-2026, muestra AG0346.
 *
 * Las entradas son independientes de Supabase: el llamador mapea las filas de la BD.
 * La salida es una estructura lista para renderizar (vista imprimible o PDF en servidor, A02).
 */

export type ExecutionType = 'SA' | 'SUBCONTRACTED'
export type AccreditationType = 'ACCREDITED' | 'NOT_ACCREDITED' | 'NOT_APPLICABLE'

export interface ReportLaboratoryInput {
  id: string
  name: string
  /**
   * Código fijo del laboratorio en el reporte (Chemilab=SA1, AGQ=SA2, IHA=SA3).
   * Viene del catálogo; NUNCA se deduce del orden de aparición.
   */
  reportCode?: string | null
  /** Resolución de acreditación vigente, tal como debe citarse */
  accreditationResolution?: string | null
}

export interface ReportSampleInput {
  id: string
  code: string
  samplingPoint?: string | null
  planCode?: string | null
  /** timestamptz o fecha ISO */
  sampledAt?: string | null
  receivedAt?: string | null
  /** Tipo de muestra (p. ej. ARnD) */
  sampleType?: string | null
  /** Tipo de muestreo (p. ej. Puntual - Compuesto) */
  samplingType?: string | null
  samplingPlace?: string | null
  /** Coordenadas tal como se registraron (no se reformatean) */
  latitude?: string | null
  longitude?: string | null
}

export interface ReportResultInput {
  id: string
  sampleId: string
  testId: string
  testCode?: string | null
  /** Nombre del ensayo en el catálogo SA (el que va en el reporte) */
  parameterName: string
  laboratory: ReportLaboratoryInput
  executionType: ExecutionType
  accreditationType?: AccreditationType | null
  /** Texto original confirmado — nunca se reformatea */
  originalText: string
  /** Texto corregido con motivo, si existe; tiene prioridad sobre el original */
  reportedText?: string | null
  unit?: string | null
  /** LCM tal como debe mostrarse (texto). Si no hay, se usa lcm numérico sin formatear */
  lcmText?: string | null
  lcm?: number | null
  uncertaintyText?: string | null
  methodText?: string | null
  techniqueText?: string | null
  analysisStart?: string | null
  analysisEnd?: string | null
  /** Agrupador visual (BTEX, HAP'S…) */
  groupLabel?: string | null
  displayOrder?: number | null
  /** Notas del laboratorio (import_rows.validation_messages): página, marca, desviaciones */
  notes?: string[]
}

export interface ReportLimitInput {
  operator?: string | null
  value?: number | null
  text?: string | null
  unit?: string | null
  /** "Análisis y Reporte", "N.A", "N.E"… */
  specialValue?: string | null
}

export interface ReportRegulationColumnInput {
  columnOrder: number
  /** Rótulo de la columna, p. ej. "Res 631 de 2015 Art. 13 y 16 * Cosméticos" */
  label: string
  /** Límites por test_id */
  limits: Record<string, ReportLimitInput>
}

export interface ReportModelInput {
  report: {
    /** Número asignado (RSA 0106-2026) o null si es borrador */
    code?: string | null
    issuedAt?: string | null
    /** Fecha a usar como fecha de reporte en borradores */
    draftDate?: string | null
  }
  template: {
    code: string
    version: number | string
    approvalDate?: string | null
    title?: string
  }
  client?: {
    businessName: string
    nit?: string | null
    address?: string | null
    city?: string | null
  } | null
  contact?: {
    name: string
    phone?: string | null
    email?: string | null
  } | null
  samples: ReportSampleInput[]
  results: ReportResultInput[]
  regulations?: ReportRegulationColumnInput[]
}

// ── Salida ────────────────────────────────────────────────────────────────

export interface ReportCellResult {
  text: string
  uncertainty: string | null
}

export interface ReportRow {
  item: number
  testId: string
  testCode: string | null
  parameter: string
  /** A, *, SA1, SA2… o null si falta en el catálogo (se reporta en issues) */
  accreditationCode: string | null
  method: string | null
  technique: string | null
  lcm: string | null
  unit: string | null
  laboratory: string
  /** Resultado por muestra (clave: sampleId) */
  results: Record<string, ReportCellResult>
  /** Un texto por columna normativa, en el orden de las columnas */
  limits: string[]
  analysisStart: string | null
  analysisEnd: string | null
}

export interface ReportSection {
  label: string | null
  rows: ReportRow[]
}

export interface ReportObservation {
  laboratory: string
  text: string
  parameters: string[]
}

export type ReportIssueSeverity = 'BLOCKING' | 'WARNING'

export interface ReportIssue {
  severity: ReportIssueSeverity
  code: string
  message: string
  testId?: string
}

export interface ReportModel {
  header: {
    title: string
    templateCode: string
    templateVersion: string
    approvalDate: string | null
    reportNumber: string | null
    isDraft: boolean
  }
  client: {
    businessName: string | null
    contact: string | null
    phone: string | null
    email: string | null
    address: string | null
    city: string | null
    nit: string | null
  }
  sampleInfo: {
    reportDate: string | null
    analysisPeriod: { start: string | null; end: string | null }
    receivedAt: string | null
    sampledAt: string | null
    planCode: string | null
    samplingPlace: string | null
    samplingType: string | null
    sampleType: string | null
    latitude: string | null
    longitude: string | null
    sampleCount: number
  }
  sampleColumns: Array<{ sampleId: string; code: string; point: string | null }>
  regulationColumns: Array<{ columnOrder: number; label: string }>
  sections: ReportSection[]
  /** Códigos de acreditación usados, con su laboratorio y resolución */
  legend: Array<{ code: string; laboratory: string; resolution: string | null }>
  observations: ReportObservation[]
  issues: ReportIssue[]
}
