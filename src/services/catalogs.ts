import { supabase } from '../lib/supabase'
import type { CatalogRecord, CatalogTable } from '../types/catalogs'

export type ActiveFilter = 'all' | 'active' | 'inactive'

function requireSupabase() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

function escapeFilterValue(value: string): string {
  return value.replace(/[(),\\]/g, ' ').trim()
}

export async function listCatalogRecords(
  table: CatalogTable,
  search: string,
  activeFilter: ActiveFilter,
  searchFields: string[],
): Promise<CatalogRecord[]> {
  const client = requireSupabase()
  let query = client.from(table).select('*')

  if (activeFilter === 'active') query = query.eq('active', true)
  if (activeFilter === 'inactive') query = query.eq('active', false)

  const term = escapeFilterValue(search)
  if (term && searchFields.length) {
    const filters = searchFields.map((field) => `${field}.ilike.%${term}%`)
    if (table === 'holidays' && /^\d{4}-\d{2}-\d{2}$/.test(term)) {
      filters.push(`date.eq.${term}`)
    }
    query = query.or(filters.join(','))
  }

  const orderField = ['matrices', 'methods', 'laboratories', 'tests', 'test_groups', 'report_templates'].includes(table)
    ? 'code'
    : table === 'holidays'
      ? 'date'
      : 'created_at'
  const { data, error } = await query.order(orderField, { ascending: true })
  if (error) throw error
  return (data ?? []) as CatalogRecord[]
}

export async function listTestIssuability(): Promise<CatalogRecord[]> {
  const { data, error } = await requireSupabase()
    .from('v_tests_issuable')
    .select('id, issuable, missing_fields, execution_class')
  if (error) throw error
  return (data ?? []) as CatalogRecord[]
}

export async function listReferenceRecords(
  table: CatalogTable,
  labelField: string,
): Promise<CatalogRecord[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('active', true)
    .order(labelField, { ascending: true })

  if (error) throw error
  return (data ?? []) as CatalogRecord[]
}

export async function createCatalogRecord(
  table: CatalogTable,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await requireSupabase().from(table).insert(values)
  if (error) throw error
}

export async function updateCatalogRecord(
  table: CatalogTable,
  id: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await requireSupabase().from(table).update(values).eq('id', id)
  if (error) throw error
}

export async function setCatalogRecordActive(
  table: CatalogTable,
  id: string,
  active: boolean,
): Promise<void> {
  const { error } = await requireSupabase()
    .from(table)
    .update({ active })
    .eq('id', id)
  if (error) throw error
}

export async function createTestVersion(
  id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  const { error } = await requireSupabase().rpc('create_test_version', {
    target_test_id: id,
    changes,
  })
  if (error) throw error
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const text = input.replace(/^\uFEFF/, '')

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }

  if (quoted) throw new Error('El CSV tiene una celda entrecomillada sin cerrar.')
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

const importableTestFields = new Set([
  'code',
  'parameter_name',
  'default_unit',
  'lcm',
  'uncertainty_text',
  'accreditation_type',
  'matrix_id',
  'method_id',
  'technique',
  'laboratory_id',
  'observations',
  'valid_from',
])

export interface CsvImportError {
  row: number
  message: string
}

export async function importTestsCsv(input: string): Promise<CsvImportError[]> {
  const [header, ...rows] = parseCsvRows(input)
  if (!header) throw new Error('El CSV no contiene encabezados.')

  const normalizedHeader = header.map((value) => value.trim().toLowerCase())
  if (new Set(normalizedHeader).size !== normalizedHeader.length) {
    throw new Error('El CSV contiene encabezados duplicados.')
  }
  const unknownHeaders = normalizedHeader.filter((name) => !importableTestFields.has(name))
  if (unknownHeaders.length) {
    throw new Error(`Encabezados no reconocidos: ${unknownHeaders.join(', ')}.`)
  }
  if (!normalizedHeader.includes('code')) {
    throw new Error('El CSV debe incluir la columna code.')
  }

  const client = requireSupabase()
  const rowErrors: CsvImportError[] = []

  for (const [index, values] of rows.entries()) {
    const rowNumber = index + 2
    if (values.length !== normalizedHeader.length) {
      rowErrors.push({ row: rowNumber, message: 'La cantidad de columnas no coincide con el encabezado.' })
      continue
    }
    const raw = Object.fromEntries(
      normalizedHeader.map((key, column) => [key, values[column].trim()]),
    )
    if (!/^SA/.test(raw.code)) {
      rowErrors.push({ row: rowNumber, message: 'El código vigente debe tener prefijo SA.' })
      continue
    }

    const payload: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (!value) continue
      if (key === 'lcm') {
        const numberValue = Number(value.replace(',', '.'))
        if (!Number.isFinite(numberValue)) {
          rowErrors.push({ row: rowNumber, message: 'LCM debe ser un número válido.' })
          continue
        }
        payload[key] = numberValue
      } else {
        payload[key] = value
      }
    }
    if (rowErrors.at(-1)?.row === rowNumber) continue

    const { error } = await client.from('tests').insert(payload)
    if (error) rowErrors.push({ row: rowNumber, message: error.message })
  }

  return rowErrors
}
