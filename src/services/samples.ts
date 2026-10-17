import { supabase } from '../lib/supabase'
import type {
  Sample,
  SampleCatalogOptions,
  SamplePayload,
} from '../types/samples'

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

export async function listSamples(): Promise<Sample[]> {
  const { data, error } = await db()
    .from('samples')
    .select(`
      *,
      client:clients(business_name, nit),
      quote:quotes(code),
      matrix:matrices(code, name),
      reception:sample_receptions(*),
      tests:sample_tests(*, test:tests(code, parameter_name), laboratory:laboratories(name)),
      events:sample_events(*)
    `)
    .order('received_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Sample[]
}

export async function getSample(id: string): Promise<Sample> {
  const { data, error } = await db()
    .from('samples')
    .select(`
      *,
      client:clients(business_name, nit),
      quote:quotes(code),
      matrix:matrices(code, name),
      reception:sample_receptions(*),
      tests:sample_tests(*, test:tests(code, parameter_name), laboratory:laboratories(name)),
      events:sample_events(*)
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as unknown as Sample
}

export async function getSampleOptions(): Promise<SampleCatalogOptions> {
  const [matrices, tests, labs, scopeTests, accreditations, setting] = await Promise.all([
    db().from('matrices').select('id, code, name').eq('active', true).order('code'),
    db().from('tests').select('id, code, parameter_name').eq('active', true).order('code'),
    db().from('laboratories').select('id, code, name, laboratory_type').eq('active', true).order('code'),
    db().from('laboratory_accredited_tests')
      .select('test_id, accreditation_id')
      .eq('active', true),
    db().from('laboratory_accreditations')
      .select('id, laboratory_id, valid_from, valid_until, active')
      .eq('active', true),
    db().from('app_settings').select('value').eq('key', 'sample.code_pattern').maybeSingle(),
  ])
  if (matrices.error) throw matrices.error
  if (tests.error) throw tests.error
  if (labs.error) throw labs.error
  if (scopeTests.error) throw scopeTests.error
  if (accreditations.error) throw accreditations.error
  if (setting.error) throw setting.error

  const accreditationById = new Map(
    (accreditations.data ?? []).map((accreditation) => [accreditation.id, accreditation]),
  )
  const accreditedScopes = (scopeTests.data ?? []).flatMap((row) => {
    const accreditation = accreditationById.get(row.accreditation_id)
    if (!accreditation) return []
    return [{
      test_id: row.test_id,
      laboratory_id: accreditation.laboratory_id,
      valid_from: accreditation.valid_from,
      valid_until: accreditation.valid_until,
      active: accreditation.active,
    }]
  })
  const configuredPattern = setting.data?.value
  return {
    matrices: matrices.data ?? [],
    tests: tests.data ?? [],
    laboratories: labs.data ?? [],
    accreditedScopes,
    codePattern: typeof configuredPattern === 'string' ? configuredPattern : '^AG[0-9]{4}$',
  }
}

export async function saveSample(
  sampleId: string | null,
  payload: SamplePayload,
  reason: string | null,
): Promise<string> {
  const { data, error } = await db().rpc('save_sample', {
    target_sample_id: sampleId,
    payload,
    edit_reason: reason,
  })
  if (error) throw error
  return data as string
}

export interface CsvSampleInput {
  row: number
  code: string
  client_nit: string
  client_name: string
  matrix_code: string
  matrix_name: string
  plan_code: string
  sampling_point: string
  sampled_at: string
}

export interface CsvSampleIssue {
  row: number
  message: string
  severity: 'error' | 'warning'
}

export interface CsvSamplePreviewRow {
  input: CsvSampleInput
  client_id: string | null
  matrix_id: string | null
  issues: CsvSampleIssue[]
}

function parseCsv(input: string): string[][] {
  const parsed: string[][] = []
  let currentRow: string[] = []
  let cell = ''
  let quoted = false
  const source = input.replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      currentRow.push(cell)
      cell = ''
    } else if ((character === '\r' || character === '\n') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      currentRow.push(cell)
      if (currentRow.some((value) => value.trim())) parsed.push(currentRow)
      currentRow = []
      cell = ''
    } else {
      cell += character
    }
  }

  if (quoted) throw new Error('El CSV tiene una celda entrecomillada sin cerrar.')
  currentRow.push(cell)
  if (currentRow.some((value) => value.trim())) parsed.push(currentRow)
  return parsed
}

const requiredCsvColumns = [
  'code',
]

export async function previewSamplesCsv(
  input: string,
  clients: { id: string; nit: string | null; business_name: string }[],
  matrices: { id: string; code: string; name: string }[],
  codePattern: string,
): Promise<CsvSamplePreviewRow[]> {
  const [header, ...rows] = parseCsv(input)
  if (!header) throw new Error('El CSV está vacío.')
  const columns = header.map((value) => value.trim().toLowerCase())
  const duplicates = columns.filter((name, index) => columns.indexOf(name) !== index)
  if (duplicates.length) throw new Error(`Columnas duplicadas: ${[...new Set(duplicates)].join(', ')}.`)
  const allowedCsvColumns = [
    ...requiredCsvColumns,
    'client_nit',
    'client_name',
    'matrix_code',
    'matrix_name',
    'plan_code',
    'sampling_point',
    'sampled_at',
  ]
  const unknown = columns.filter((name) => !allowedCsvColumns.includes(name))
  if (unknown.length) throw new Error(`Columnas no reconocidas: ${unknown.join(', ')}.`)
  const missing = requiredCsvColumns.filter((name) => !columns.includes(name))
  if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(', ')}.`)
  if (!columns.includes('client_nit') && !columns.includes('client_name')) {
    throw new Error('Incluye una columna client_nit o client_name para identificar al cliente.')
  }
  if (!columns.includes('matrix_code') && !columns.includes('matrix_name')) {
    throw new Error('Incluye una columna matrix_code o matrix_name para identificar la matriz.')
  }

  let matcher: RegExp
  try {
    matcher = new RegExp(codePattern)
  } catch {
    throw new Error('El patrón de código configurado no es una expresión regular válida.')
  }

  return rows.map((values, index) => {
    const rowNumber = index + 2
    const issues: CsvSampleIssue[] = []
    if (values.length !== columns.length) {
      issues.push({ row: rowNumber, message: 'La cantidad de columnas no coincide con el encabezado.', severity: 'error' })
    }
    const record = Object.fromEntries(columns.map((column, columnIndex) => [
      column, (values[columnIndex] ?? '').trim(),
    ]))
    const inputRow: CsvSampleInput = {
      row: rowNumber,
      code: record.code ?? '',
      client_nit: record.client_nit ?? '',
      client_name: record.client_name ?? '',
      matrix_code: record.matrix_code ?? '',
      matrix_name: record.matrix_name ?? '',
      plan_code: record.plan_code ?? '',
      sampling_point: record.sampling_point ?? '',
      sampled_at: record.sampled_at ?? '',
    }
    matcher.lastIndex = 0
    if (!matcher.test(inputRow.code)) {
      issues.push({ row: rowNumber, message: 'Código de muestra inválido según el patrón configurado.', severity: 'error' })
    }
    const client = clients.find((candidate) =>
      (inputRow.client_nit && candidate.nit === inputRow.client_nit) ||
      (inputRow.client_name && candidate.business_name.toLocaleLowerCase() === inputRow.client_name.toLocaleLowerCase()),
    )
    if (!client) issues.push({ row: rowNumber, message: 'Cliente no encontrado.', severity: 'error' })
    const matrix = matrices.find((candidate) =>
      (inputRow.matrix_code && candidate.code === inputRow.matrix_code) ||
      (inputRow.matrix_name && candidate.name.toLocaleLowerCase() === inputRow.matrix_name.toLocaleLowerCase()),
    )
    if (!matrix) issues.push({ row: rowNumber, message: 'Matriz no encontrada.', severity: 'error' })
    if (inputRow.sampled_at) {
      const timestamp = Date.parse(inputRow.sampled_at)
      if (!Number.isFinite(timestamp)) {
        issues.push({ row: rowNumber, message: 'Fecha de muestreo inválida.', severity: 'error' })
      } else {
        const date = new Date(timestamp)
        if (date.getTime() > Date.now()) {
          issues.push({ row: rowNumber, message: 'La fecha de muestreo está en el futuro; verificar antes de importar.', severity: 'warning' })
        }
        if (date.getFullYear() !== new Date().getFullYear()) {
          issues.push({ row: rowNumber, message: 'El año de muestreo difiere del año actual; verificar posible error de digitación.', severity: 'warning' })
        }
      }
    }
    return { input: inputRow, client_id: client?.id ?? null, matrix_id: matrix?.id ?? null, issues }
  })
}

export async function importSampleRows(rows: CsvSampleInput[]) {
  const payload = rows.map((row) => ({
    code: row.code,
    client_nit: row.client_nit || null,
    client_name: row.client_name || null,
    matrix_code: row.matrix_code || null,
    matrix_name: row.matrix_name || null,
    plan_code: row.plan_code || null,
    sampling_point: row.sampling_point || null,
    sampled_at: row.sampled_at || null,
  }))
  const { data, error } = await db().rpc('import_samples_csv', { rows: payload })
  if (error) throw error
  return data as { imported_count: number; errors: CsvSampleIssue[] }
}
