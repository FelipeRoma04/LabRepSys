import { supabase } from '../lib/supabase'
import type { ReportReview } from '../types/reports'

export interface ReportSampleOption {
  id: string
  code: string
  client_id: string
  client: { business_name: string } | null
  matrix: { name: string } | null
  sampled_at: string | null
  received_at: string
  sampling_point: string | null
  observations: string | null
}

export interface ReportResultOption {
  id: string
  sample_id: string
  test_id: string
  operator: string | null
  numeric_value: number | null
  original_text: string | null
  reported_text: string | null
  unit: string | null
  lcm: number | null
  uncertainty_text: string | null
  method_text: string | null
  technique_text: string | null
  accreditation_type: string | null
  analysis_start: string | null
  analysis_end: string | null
  test: { code: string; parameter_name: string | null } | null
  laboratory: { name: string } | null
  execution_type: 'SA' | 'SUBCONTRACTED' | null
  assigned_laboratory: { name: string } | null
}

export interface ReportRegulationOption {
  id: string
  sample_id: string
  version: {
    version_name: string
    regulation: { code: string; name: string } | null
    activity: {
      article: string
      activity: string
      limits: Array<{
        test_id: string
        limit_operator: string | null
        limit_value: number | null
        limit_text: string | null
        unit: string | null
        special_value: string | null
      }> | null
    } | null
  } | null
}

export interface ApprovedTemplateOption {
  id: string
  code: string
  version: number
}

export interface ReportBuilderOptions {
  samples: ReportSampleOption[]
  results: ReportResultOption[]
  regulations: ReportRegulationOption[]
  clients: Array<{ id: string; business_name: string }>
  contacts: Array<{ id: string; client_id: string; name: string }>
  templates: ApprovedTemplateOption[]
}

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

export async function getReportBuilderOptions(): Promise<ReportBuilderOptions> {
  const [samples, results, sampleTests, regulations, clients, contacts, templates] = await Promise.all([
    db().from('samples')
      .select('id,code,client_id,sampled_at,received_at,sampling_point,observations,client:clients(business_name),matrix:matrices(name)')
      .order('received_at', { ascending: false }),
    db().from('results')
      .select('id,sample_id,test_id,operator,numeric_value,original_text,reported_text,unit,lcm,uncertainty_text,method_text,technique_text,accreditation_type,analysis_start,analysis_end,test:tests(code,parameter_name),laboratory:laboratories(name)')
      .order('created_at'),
    db().from('sample_tests')
      .select('sample_id,test_id,execution_type,assigned_laboratory:laboratories(name)'),
    db().from('sample_regulations')
      .select('id,sample_id,version:regulation_versions(version_name,regulation:regulations(code,name),activity:regulation_activities(article,activity,limits:regulation_limits(test_id,limit_operator,limit_value,limit_text,unit,special_value)))')
      .eq('confirmed', true)
      .order('column_order'),
    db().from('clients').select('id,business_name').eq('active', true).order('business_name'),
    db().from('contacts').select('id,client_id,name').eq('active', true).order('name'),
    db().from('report_templates').select('id,code,version').eq('active', true).eq('status', 'APPROVED').order('code'),
  ])

  for (const query of [samples, results, sampleTests, regulations, clients, contacts, templates]) {
    if (query.error) throw query.error
  }

  const executionByResult = new Map<string, {
    execution_type: 'SA' | 'SUBCONTRACTED'
    assigned_laboratory: { name: string } | { name: string }[] | null
  }>(
    ((sampleTests.data ?? []) as unknown as Array<{
      sample_id: string
      test_id: string
      execution_type: 'SA' | 'SUBCONTRACTED'
      assigned_laboratory: { name: string } | { name: string }[] | null
    }>).map((sampleTest) => [
      `${sampleTest.sample_id}:${sampleTest.test_id}`,
      sampleTest,
    ]),
  )
  const resultRows = ((results.data ?? []) as unknown as ReportResultOption[]).map((result) => {
    const execution = executionByResult.get(`${result.sample_id}:${result.test_id}`)
    return {
      ...result,
      execution_type: (execution?.execution_type ?? null) as ReportResultOption['execution_type'],
      assigned_laboratory: Array.isArray(execution?.assigned_laboratory)
        ? execution.assigned_laboratory[0] ?? null
        : execution?.assigned_laboratory ?? null,
    }
  })

  return {
    samples: (samples.data ?? []) as unknown as ReportSampleOption[],
    results: resultRows,
    regulations: (regulations.data ?? []) as unknown as ReportRegulationOption[],
    clients: clients.data ?? [],
    contacts: contacts.data ?? [],
    templates: templates.data ?? [],
  }
}

export async function saveReportDraft(input: {
  reportId: string | null
  clientId: string | null
  contactId: string | null
  templateId: string | null
  sampleIds: string[]
  resultIds: string[]
}): Promise<string> {
  const { data, error } = await db().rpc('save_report_draft', {
    p_report_id: input.reportId,
    p_client_id: input.clientId,
    p_contact_id: input.contactId,
    p_template_id: input.templateId,
    p_sample_ids: input.sampleIds,
    p_result_ids: input.resultIds,
  })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('No se recibió el identificador del reporte guardado.')
  return data
}

export async function getReportComposition(reportId: string) {
  const [samples, results, sampleTests, regulations, reviews, comments, runs] = await Promise.all([
    db().from('report_samples')
      .select('sample:samples(id,code,client_id,sampled_at,received_at,sampling_point,client:clients(business_name),matrix:matrices(name))')
      .eq('report_id', reportId),
    db().from('report_results')
      .select('display_order,group_label,result:results(id,sample_id,test_id,operator,numeric_value,original_text,reported_text,unit,lcm,uncertainty_text,method_text,technique_text,accreditation_type,analysis_start,analysis_end,test:tests(code,parameter_name),laboratory:laboratories(name))')
      .eq('report_id', reportId)
      .order('display_order'),
    db().from('report_samples')
      .select('sample_id,sample_tests:sample_tests(sample_id,test_id,execution_type,assigned_laboratory:laboratories(name))')
      .eq('report_id', reportId),
    db().from('report_regulation_columns')
      .select('column_order,regulation:sample_regulations(id,sample_id,version:regulation_versions(version_name,regulation:regulations(code,name),activity:regulation_activities(article,activity,limits:regulation_limits(test_id,limit_operator,limit_value,limit_text,unit,special_value))))')
      .eq('report_id', reportId)
      .order('column_order'),
    db().from('report_reviews').select('*').eq('report_id', reportId).order('created_at'),
    db().from('report_comments').select('*').eq('report_id', reportId).order('created_at'),
    db().from('validation_runs').select('id,status,created_at,issues:validation_issues(id,rule_code,severity,field_name,message,blocking,resolved)')
      .eq('entity_type', 'REPORT').eq('entity_id', reportId).order('created_at', { ascending: false }).limit(1),
  ])

  for (const query of [samples, results, sampleTests, regulations, reviews, comments, runs]) {
    if (query.error) throw query.error
  }
  const executionByResult = new Map<string, { execution_type: 'SA' | 'SUBCONTRACTED'; assigned_laboratory: { name: string } | null }>()
  for (const sampleRow of (sampleTests.data ?? []) as unknown as Array<{
    sample_tests: Array<{
      sample_id: string
      test_id: string
      execution_type: 'SA' | 'SUBCONTRACTED'
      assigned_laboratory: { name: string } | { name: string }[] | null
    }> | null
  }>) {
    for (const sampleTest of sampleRow.sample_tests ?? []) {
      const assignedLaboratory = Array.isArray(sampleTest.assigned_laboratory)
        ? sampleTest.assigned_laboratory[0] ?? null
        : sampleTest.assigned_laboratory
      executionByResult.set(`${sampleTest.sample_id}:${sampleTest.test_id}`, {
        execution_type: sampleTest.execution_type,
        assigned_laboratory: assignedLaboratory,
      })
    }
  }
  const resultRows = ((results.data ?? []) as unknown as Array<{
    display_order: number
    group_label: string | null
    result: Omit<ReportResultOption, 'execution_type' | 'assigned_laboratory'> | null
  }>).map((row) => ({
    ...row,
    result: row.result ? {
      ...row.result,
      ...(executionByResult.get(`${row.result.sample_id}:${row.result.test_id}`) ?? {
        execution_type: null,
        assigned_laboratory: null,
      }),
    } as ReportResultOption : null,
  }))
  return {
    samples: (samples.data ?? []) as unknown as Array<{ sample: ReportSampleOption | null }>,
    results: resultRows,
    regulations: (regulations.data ?? []) as unknown as Array<{
      column_order: number
      regulation: ReportRegulationOption | null
    }>,
    reviews: (reviews.data ?? []) as ReportReview[],
    comments: (comments.data ?? []) as Array<{
      id: string
      entity_type: 'REPORT' | 'RESULT' | 'FIELD'
      entity_id: string | null
      comment: string
      resolved: boolean
      created_by: string
      created_at: string
    }>,
    validationRun: runs.data?.[0] ?? null,
  }
}

export async function addReportComment(input: {
  reportId: string
  entityType: 'REPORT' | 'RESULT' | 'FIELD'
  entityId: string | null
  comment: string
  createdBy: string
}): Promise<void> {
  const { error } = await db().from('report_comments').insert({
    report_id: input.reportId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    comment: input.comment.trim(),
    created_by: input.createdBy,
  })
  if (error) throw error
}

export async function getReportHistory(reportId: string) {
  const { data, error } = await db().rpc('get_report_history', {
    p_report_id: reportId,
  })
  if (error) throw error
  return (data ?? []) as Array<{
    created_at: string
    action: string
    old_data: Record<string, unknown> | null
    new_data: Record<string, unknown> | null
    reason: string | null
  }>
}

export async function isCurrentApprovalDeputy(userId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await db()
    .from('approval_deputies')
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .lte('valid_from', today)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}
