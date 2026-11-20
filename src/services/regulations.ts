import { supabase } from '../lib/supabase'
import type {
  QuoteRegulationSuggestion,
  Regulation,
  RegulationActivity,
  RegulationCsvError,
  RegulationCsvRow,
  RegulationLimit,
  RegulationSample,
  RegulationVersion,
  SampleRegulation,
} from '../types/regulations'

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

export function parseRegulationCsv(input: string): RegulationCsvRow[] {
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const source = input.replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((character === '\r' || character === '\n') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((value) => value.trim())) records.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }
  if (quoted) throw new Error('El CSV contiene una celda entrecomillada sin cerrar.')
  row.push(field)
  if (row.some((value) => value.trim())) records.push(row)

  const [header, ...body] = records
  if (!header) throw new Error('El archivo CSV está vacío.')
  const columns = header.map((value) => value.trim().toLowerCase())
  const required = [
    'article',
    'activity',
    'discharge_type',
    'test_code',
    'limit_operator',
    'limit_value',
    'special_value',
  ]
  const duplicates = columns.filter((value, index) => columns.indexOf(value) !== index)
  if (duplicates.length) {
    throw new Error(`Hay encabezados duplicados: ${[...new Set(duplicates)].join(', ')}.`)
  }
  const unknown = columns.filter((value) => ![
    ...required,
    'description',
    'limit_text',
    'unit',
  ].includes(value))
  if (unknown.length) throw new Error(`Encabezados no reconocidos: ${unknown.join(', ')}.`)
  const missing = required.filter((value) => !columns.includes(value))
  if (missing.length) throw new Error(`Faltan encabezados requeridos: ${missing.join(', ')}.`)

  return body.map((values, index) => {
    const record = Object.fromEntries(columns.map((column, columnIndex) => [
      column,
      values[columnIndex]?.trim() ?? '',
    ]))
    return {
      row_number: index + 2,
      article: record.article ?? '',
      activity: record.activity ?? '',
      discharge_type: record.discharge_type as RegulationCsvRow['discharge_type'],
      description: record.description ?? '',
      test_code: record.test_code ?? '',
      limit_operator: record.limit_operator ?? '',
      limit_value: record.limit_value ?? '',
      limit_text: record.limit_text ?? '',
      unit: record.unit ?? '',
      special_value: record.special_value ?? '',
    }
  })
}

export const regulationCsvTemplate = [
  'article,activity,discharge_type,description,test_code,limit_operator,limit_value,limit_text,unit,special_value',
].join('\r\n')

export async function getRegulationCatalog() {
  const [regulations, versions, activities, limits] = await Promise.all([
    db().from('regulations').select('*').order('name'),
    db().from('regulation_versions').select('*').order('created_at', { ascending: false }),
    db().from('regulation_activities').select('*').order('article').order('activity'),
    db().from('regulation_limits')
      .select('*, test:tests(code, parameter_name)')
      .order('created_at'),
  ])
  if (regulations.error) throw regulations.error
  if (versions.error) throw versions.error
  if (activities.error) throw activities.error
  if (limits.error) throw limits.error
  return {
    regulations: (regulations.data ?? []) as Regulation[],
    versions: (versions.data ?? []) as RegulationVersion[],
    activities: (activities.data ?? []) as RegulationActivity[],
    limits: (limits.data ?? []) as RegulationLimit[],
  }
}

export async function listRegulationSamples(): Promise<RegulationSample[]> {
  const { data, error } = await db()
    .from('samples')
    .select(`
      id, code, quote_id, quote:quotes(code), matrix:matrices(code, name),
      reception:sample_receptions(request_review)
    `)
    .order('received_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as RegulationSample[]
}

export async function listSampleRegulations(sampleId: string): Promise<SampleRegulation[]> {
  const { data, error } = await db()
    .from('sample_regulations')
    .select(`
      *,
      version:regulation_versions(version_name, regulation:regulations(name)),
      activity:regulation_activities(id, article, activity, discharge_type, description)
    `)
    .eq('sample_id', sampleId)
    .order('column_order')
  if (error) throw error
  return (data ?? []) as unknown as SampleRegulation[]
}

export function getQuoteRegulationSuggestions(
  sample: RegulationSample | null,
): QuoteRegulationSuggestion[] {
  const suggestions = sample?.reception?.request_review.quote_suggestions
  if (typeof suggestions !== 'object' || suggestions === null || !('regulations' in suggestions)) return []
  const rows = suggestions.regulations
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    if (typeof row !== 'object' || row === null) return []
    const item = row as Record<string, unknown>
    if (typeof item.regulation_name !== 'string') return []
    const discharge = item.discharge_type
    return [{
      regulation_name: item.regulation_name,
      article: typeof item.article === 'string' ? item.article : null,
      activity: typeof item.activity === 'string' ? item.activity : null,
      discharge_type: discharge === 'ARD' || discharge === 'ARnD' ? discharge : 'NA',
    }]
  })
}

export async function importRegulationCsv(
  versionName: string,
  validFrom: string | null,
  validUntil: string | null,
  rows: RegulationCsvRow[],
): Promise<{ versionId: string; importedCount: number; errors: RegulationCsvError[] }> {
  const { data, error } = await db().rpc('import_regulation_csv', {
    p_version_name: versionName,
    p_valid_from: validFrom,
    p_valid_until: validUntil,
    p_import_rows: rows,
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || !('version_id' in data) ||
    typeof data.version_id !== 'string' || !('imported_count' in data) ||
    typeof data.imported_count !== 'number' || !('errors' in data) ||
    !Array.isArray(data.errors)) {
    throw new Error('La respuesta del servidor no contiene un informe de importación válido.')
  }
  return {
    versionId: data.version_id,
    importedCount: data.imported_count,
    errors: data.errors as RegulationCsvError[],
  }
}

export async function activateRegulationVersion(versionId: string): Promise<void> {
  const { data, error } = await db().rpc('activate_regulation_version', {
    target_version_id: versionId,
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || !('ok' in data) || data.ok !== true) {
    throw new Error('El servidor no confirmó la activación de la versión.')
  }
}

export async function confirmSampleRegulations(
  sampleId: string,
  activityIds: string[],
  reason: string,
): Promise<{ confirmedCount: number; quoteDifference: boolean }> {
  const { data, error } = await db().rpc('confirm_sample_regulations', {
    target_sample_id: sampleId,
    selections: activityIds.map((activity_id) => ({ activity_id })),
    decision_reason: reason || null,
  })
  if (error) throw error
  if (!data || typeof data !== 'object' || !('ok' in data) || data.ok !== true ||
    !('confirmed_count' in data) || typeof data.confirmed_count !== 'number' ||
    !('quote_difference' in data) || typeof data.quote_difference !== 'boolean') {
    throw new Error('El servidor no confirmó una selección normativa válida.')
  }
  return {
    confirmedCount: data.confirmed_count,
    quoteDifference: data.quote_difference,
  }
}
