/**
 * Convierte los registros de un reporte (con la forma del snapshot de emisión) en la
 * entrada de buildReportModel. Sirve igual para:
 * - un RSA EMITIDO: los registros son report_snapshots.snapshot_data (inmutable);
 * - un BORRADOR: el servicio arma la misma forma con datos vivos.
 *
 * No convierte ni redondea nada; lo que falta queda en null y buildReportModel lo
 * reporta como issue.
 */
import type {
  ExecutionType,
  ReportLimitInput,
  ReportModelInput,
  ReportResultInput,
} from './types'

export interface ReportRecordLaboratory {
  id?: string | null
  name?: string | null
  laboratory_type?: 'INTERNAL' | 'EXTERNAL' | null
  report_code?: string | null
  accreditation_resolution?: string | null
}

export interface ReportRecordResult {
  id: string
  sample_id: string
  test_id: string
  original_text?: string | null
  reported_text?: string | null
  unit?: string | null
  lcm?: number | null
  uncertainty_text?: string | null
  method_text?: string | null
  technique_text?: string | null
  accreditation_type?: 'ACCREDITED' | 'NOT_ACCREDITED' | 'NOT_APPLICABLE' | null
  analysis_start?: string | null
  analysis_end?: string | null
  test?: { code?: string | null; parameter_name?: string | null } | null
  laboratory?: ReportRecordLaboratory | null
  execution_type?: ExecutionType | null
  group_label?: string | null
  display_order?: number | null
  notes?: unknown
}

export interface ReportRecordLimit {
  test_id: string
  limit_operator?: string | null
  limit_value?: number | null
  limit_text?: string | null
  unit?: string | null
  special_value?: string | null
}

export interface ReportRecords {
  code?: string | null
  issued_at?: string | null
  template?: {
    code?: string | null
    version?: number | string | null
    approval_date?: string | null
    configuration?: { header?: { documentTypeLabel?: string | null } | null } | null
  } | null
  client?: { business_name?: string | null; nit?: string | null; address?: string | null; city?: string | null } | null
  contact?: { name?: string | null; phone?: string | null; email?: string | null } | null
  samples?: Array<{
    id: string
    code: string
    sampling_point?: string | null
    plan_code?: string | null
    sampled_at?: string | null
    received_at?: string | null
    matrix?: { code?: string | null; name?: string | null } | null
    field_data?: { latitude_original?: string | null; longitude_original?: string | null } | null
  }> | null
  results?: ReportRecordResult[] | null
  regulations?: Array<{
    column_order: number
    name?: string | null
    version_name?: string | null
    article?: string | null
    activity?: string | null
    limits?: ReportRecordLimit[] | null
  }> | null
}

function text(value: string | null | undefined): string | null {
  return value && value.trim() ? value : null
}

function notesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((note): note is string => typeof note === 'string') : []
}

/** Rótulo de la columna normativa, p. ej. "Res 631 de 2015 · Art. 13 y 16 · Cosméticos" */
export function regulationLabel(regulation: NonNullable<ReportRecords['regulations']>[number]): string {
  return [regulation.name, regulation.article, regulation.activity]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(' · ') || `Normativa ${regulation.column_order}`
}

function executionTypeOf(result: ReportRecordResult): ExecutionType {
  if (result.execution_type) return result.execution_type
  // Sin el dato, un laboratorio que no sea claramente interno se trata como
  // subcontratado: así se exige su sigla SAn en lugar de marcarlo como propio.
  return result.laboratory?.laboratory_type === 'INTERNAL' ? 'SA' : 'SUBCONTRACTED'
}

export function toReportModelInput(records: ReportRecords, options: { draftDate?: string | null } = {}): ReportModelInput {
  const results: ReportResultInput[] = (records.results ?? []).map((result) => ({
    id: result.id,
    sampleId: result.sample_id,
    testId: result.test_id,
    testCode: result.test?.code ?? null,
    parameterName: text(result.test?.parameter_name) ?? text(result.test?.code) ?? result.test_id,
    laboratory: {
      id: result.laboratory?.id ?? result.laboratory?.name ?? 'sin-laboratorio',
      name: text(result.laboratory?.name) ?? 'Laboratorio no identificado',
      reportCode: result.laboratory?.report_code ?? null,
      accreditationResolution: result.laboratory?.accreditation_resolution ?? null,
    },
    executionType: executionTypeOf(result),
    accreditationType: result.accreditation_type ?? null,
    originalText: result.original_text ?? '',
    reportedText: result.reported_text ?? null,
    unit: result.unit ?? null,
    lcm: result.lcm ?? null,
    uncertaintyText: result.uncertainty_text ?? null,
    methodText: result.method_text ?? null,
    techniqueText: result.technique_text ?? null,
    analysisStart: result.analysis_start ?? null,
    analysisEnd: result.analysis_end ?? null,
    groupLabel: result.group_label ?? null,
    displayOrder: result.display_order ?? null,
    notes: notesOf(result.notes),
  }))

  return {
    report: {
      code: records.code ?? null,
      issuedAt: records.issued_at ?? null,
      draftDate: options.draftDate ?? null,
    },
    template: {
      code: text(records.template?.code) ?? 'Plantilla no asignada',
      version: records.template?.version ?? '—',
      approvalDate: records.template?.approval_date ?? null,
      title: text(records.template?.configuration?.header?.documentTypeLabel) ?? undefined,
    },
    client: records.client?.business_name
      ? {
        businessName: records.client.business_name,
        nit: records.client.nit ?? null,
        address: records.client.address ?? null,
        city: records.client.city ?? null,
      }
      : null,
    contact: records.contact?.name
      ? { name: records.contact.name, phone: records.contact.phone ?? null, email: records.contact.email ?? null }
      : null,
    samples: (records.samples ?? []).map((sample) => ({
      id: sample.id,
      code: sample.code,
      samplingPoint: sample.sampling_point ?? null,
      planCode: sample.plan_code ?? null,
      sampledAt: sample.sampled_at ?? null,
      receivedAt: sample.received_at ?? null,
      sampleType: text(sample.matrix?.name) ?? text(sample.matrix?.code),
      // Pendiente en el esquema: no existen columnas de tipo ni lugar de muestreo.
      samplingType: null,
      samplingPlace: null,
      latitude: sample.field_data?.latitude_original ?? null,
      longitude: sample.field_data?.longitude_original ?? null,
    })),
    results,
    regulations: (records.regulations ?? []).map((regulation) => ({
      columnOrder: regulation.column_order,
      label: regulationLabel(regulation),
      limits: Object.fromEntries((regulation.limits ?? []).map((limit): [string, ReportLimitInput] => [limit.test_id, {
        operator: limit.limit_operator ?? null,
        value: limit.limit_value ?? null,
        text: limit.limit_text ?? null,
        unit: limit.unit ?? null,
        specialValue: limit.special_value ?? null,
      }])),
    })),
  }
}
