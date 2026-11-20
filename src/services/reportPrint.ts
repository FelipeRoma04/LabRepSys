/**
 * Datos para la vista imprimible del RSA.
 * - EMITIDO: se usa SOLO el snapshot congelado al emitir (report_snapshots).
 * - BORRADOR: se arman los mismos registros con datos vivos.
 * La forma común es ReportRecords (src/lib/report/fromRecords.ts).
 */
import { supabase } from '../lib/supabase'
import type { ReportRecordResult, ReportRecords } from '../lib/report'
import type { Report } from '../types/reports'
import type { TemplateConfig } from '../types/templateConfig'

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export interface ReportPrintData {
  report: Report
  records: ReportRecords
  /** true si los registros vienen del snapshot de emisión */
  fromSnapshot: boolean
  templateConfig: Partial<TemplateConfig> | null
  approvedByName: string | null
}

export async function loadReportPrintData(reportId: string): Promise<ReportPrintData> {
  const { data: report, error } = await db().from('reports').select('*').eq('id', reportId).maybeSingle()
  if (error) throw error
  if (!report) throw new Error('Reporte no encontrado.')
  const typedReport = report as Report

  if (typedReport.status === 'ISSUED') {
    const { data: snapshot, error: snapshotError } = await db()
      .from('report_snapshots').select('snapshot_data').eq('report_id', reportId).maybeSingle()
    if (snapshotError) throw snapshotError
    if (!snapshot) throw new Error('El reporte está emitido pero no tiene snapshot: no se imprime desde datos vivos.')
    const data = snapshot.snapshot_data as ReportRecords & {
      template?: { configuration?: Partial<TemplateConfig> | null } | null
      approved_by?: { full_name?: string | null } | null
    }
    return {
      report: typedReport,
      records: data,
      fromSnapshot: true,
      templateConfig: data.template?.configuration ?? null,
      approvedByName: data.approved_by?.full_name ?? null,
    }
  }

  return { ...(await loadLiveRecords(typedReport)), report: typedReport, fromSnapshot: false }
}

async function loadLiveRecords(report: Report): Promise<Omit<ReportPrintData, 'report' | 'fromSnapshot'>> {
  const [samples, reportResults, columns, client, contact, template, approver] = await Promise.all([
    db().from('report_samples')
      .select('sample:samples(id,code,sampling_point,plan_code,sampled_at,received_at,matrix:matrices(code,name))')
      .eq('report_id', report.id),
    db().from('report_results')
      .select('display_order,group_label,result:results(id,sample_id,test_id,original_text,reported_text,unit,lcm,uncertainty_text,method_text,technique_text,accreditation_type,analysis_start,analysis_end,source_import_row_id,test:tests(code,parameter_name),laboratory:laboratories(id,name,laboratory_type,report_code))')
      .eq('report_id', report.id)
      .order('display_order'),
    db().from('report_regulation_columns')
      .select('column_order,regulation:sample_regulations(version:regulation_versions(version_name,regulation:regulations(name)),activity:regulation_activities(article,activity,limits:regulation_limits(test_id,limit_operator,limit_value,limit_text,unit,special_value)))')
      .eq('report_id', report.id)
      .order('column_order'),
    report.client_id
      ? db().from('clients').select('business_name,nit,address,city').eq('id', report.client_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    report.contact_id
      ? db().from('contacts').select('name,phone,email').eq('id', report.contact_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    report.template_id
      ? db().from('report_templates').select('code,version,approval_date,configuration').eq('id', report.template_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    report.approved_by
      ? db().from('profiles').select('full_name').eq('id', report.approved_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  for (const query of [samples, reportResults, columns, client, contact, template, approver]) {
    if (query.error) throw query.error
  }

  type LiveSample = NonNullable<ReportRecords['samples']>[number] & { matrix?: unknown }
  const sampleRows = ((samples.data ?? []) as unknown as Array<{ sample: LiveSample | LiveSample[] | null }>)
    .flatMap((row) => { const sample = one(row.sample); return sample ? [{ ...sample, matrix: one(sample.matrix as never) }] : [] })
  const sampleIds = sampleRows.map((sample) => sample.id)

  type LiveResult = Omit<ReportRecordResult, 'laboratory' | 'test'> & {
    source_import_row_id?: string | null
    test?: unknown
    laboratory?: unknown
  }
  const resultRows = ((reportResults.data ?? []) as unknown as Array<{
    display_order: number | null
    group_label: string | null
    result: LiveResult | LiveResult[] | null
  }>).flatMap((row) => { const result = one(row.result); return result ? [{ ...result, display_order: row.display_order, group_label: row.group_label }] : [] })

  const labIds = [...new Set(resultRows.map((row) => (one(row.laboratory as never) as { id?: string } | null)?.id).filter((id): id is string => !!id))]
  const importRowIds = resultRows.map((row) => row.source_import_row_id).filter((id): id is string => !!id)
  const today = new Date().toISOString().slice(0, 10)

  const [fieldData, sampleTests, accreditations, importRows] = await Promise.all([
    sampleIds.length
      ? db().from('sample_field_data').select('sample_id,latitude_original,longitude_original').in('sample_id', sampleIds)
      : Promise.resolve({ data: [], error: null }),
    sampleIds.length
      ? db().from('sample_tests').select('sample_id,test_id,execution_type').in('sample_id', sampleIds)
      : Promise.resolve({ data: [], error: null }),
    labIds.length
      ? db().from('laboratory_accreditations').select('laboratory_id,resolution,valid_from,valid_until').eq('active', true).in('laboratory_id', labIds)
      : Promise.resolve({ data: [], error: null }),
    importRowIds.length
      ? db().from('import_rows').select('id,validation_messages').in('id', importRowIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const query of [fieldData, sampleTests, accreditations, importRows]) {
    if (query.error) throw query.error
  }

  const fieldBySample = new Map(((fieldData.data ?? []) as Array<{ sample_id: string; latitude_original: string | null; longitude_original: string | null }>)
    .map((row) => [row.sample_id, row]))
  const executionByKey = new Map(((sampleTests.data ?? []) as Array<{ sample_id: string; test_id: string; execution_type: 'SA' | 'SUBCONTRACTED' }>)
    .map((row) => [`${row.sample_id}:${row.test_id}`, row.execution_type]))
  const resolutionByLab = new Map<string, string>()
  for (const row of ((accreditations.data ?? []) as Array<{ laboratory_id: string; resolution: string | null; valid_from: string | null; valid_until: string | null }>)
    .filter((row) => row.resolution && (!row.valid_from || row.valid_from <= today) && (!row.valid_until || row.valid_until >= today))
    .sort((a, b) => (b.valid_from ?? '').localeCompare(a.valid_from ?? ''))) {
    if (!resolutionByLab.has(row.laboratory_id)) resolutionByLab.set(row.laboratory_id, row.resolution!)
  }
  const notesByImportRow = new Map(((importRows.data ?? []) as Array<{ id: string; validation_messages: unknown }>)
    .map((row) => [row.id, row.validation_messages]))

  const templateRow = template.data as { code: string; version: number; approval_date: string | null; configuration: Partial<TemplateConfig> | null } | null

  const records: ReportRecords = {
    code: report.code ?? null,
    issued_at: null,
    template: templateRow
      ? { code: templateRow.code, version: templateRow.version, approval_date: templateRow.approval_date, configuration: templateRow.configuration as never }
      : null,
    client: client.data as ReportRecords['client'],
    contact: contact.data as ReportRecords['contact'],
    samples: sampleRows.map((sample) => ({
      ...sample,
      matrix: sample.matrix as { code?: string | null; name?: string | null } | null,
      field_data: fieldBySample.get(sample.id) ?? null,
    })),
    results: resultRows.map((row) => {
      const laboratory = one(row.laboratory as never) as ReportRecordResult['laboratory']
      return {
        ...row,
        test: one(row.test as never) as ReportRecordResult['test'],
        laboratory: laboratory
          ? { ...laboratory, accreditation_resolution: laboratory.id ? resolutionByLab.get(laboratory.id) ?? null : null }
          : null,
        execution_type: executionByKey.get(`${row.sample_id}:${row.test_id}`) ?? null,
        notes: row.source_import_row_id ? notesByImportRow.get(row.source_import_row_id) ?? [] : [],
      }
    }),
    regulations: ((columns.data ?? []) as unknown as Array<{
      column_order: number
      regulation: {
        version: { version_name: string | null; regulation: { name: string | null } | { name: string | null }[] | null } | null
        activity: { article: string | null; activity: string | null; limits: NonNullable<ReportRecords['regulations']>[number]['limits'] } | null
      } | null
    }>).map((column) => {
      const version = one(column.regulation?.version)
      const activity = one(column.regulation?.activity)
      return {
        column_order: column.column_order,
        name: one(version?.regulation)?.name ?? null,
        version_name: version?.version_name ?? null,
        article: activity?.article ?? null,
        activity: activity?.activity ?? null,
        limits: activity?.limits ?? [],
      }
    }),
  }

  return {
    records,
    templateConfig: templateRow?.configuration ?? null,
    approvedByName: (approver.data as { full_name: string | null } | null)?.full_name ?? null,
  }
}
