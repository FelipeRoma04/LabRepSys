import { supabase } from '../../lib/supabase'
import type {
  SearchEntityType,
  SearchFilters,
  SearchPageResult,
  SearchResult,
} from './searchTypes'

const pageSize = 20

interface SearchRow {
  id: string
  code?: string | null
  business_name?: string
  alias?: string | null
  nit?: string | null
  plan_code?: string | null
  sampling_point?: string | null
  status?: string
  active?: boolean
  quote_date?: string | null
  sampled_at?: string | null
  received_at?: string | null
  created_at?: string
  client_id?: string | null
  clients?: { business_name: string } | { business_name: string }[] | null
}

interface QueryResult {
  data: SearchRow[] | null
  count: number | null
  error: { code?: string; message: string } | null
}

function orPattern(term: string): string {
  const accentClasses: Record<string, string> = {
    a: '[aáàâäãåā]',
    c: '[cç]',
    e: '[eéèêëē]',
    i: '[iíìîïī]',
    n: '[nñ]',
    o: '[oóòôöõō]',
    u: '[uúùûüū]',
  }
  const escaped = term
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split('')
    .map((character) => accentClasses[character] ??
      character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('')
  return `".*${escaped}.*"`
}

function queryWindow(page: number) {
  return { from: 0, to: (page + 1) * pageSize - 1 }
}

function applyTimestampFilters<T extends {
  gte: (column: string, value: string) => T
  lt: (column: string, value: string) => T
}>(query: T, column: string, filters: SearchFilters): T {
  let filtered = query
  if (filters.dateFrom) {
    filtered = filtered.gte(column, `${filters.dateFrom}T00:00:00.000Z`)
  }
  if (filters.dateTo) {
    const nextDay = new Date(`${filters.dateTo}T00:00:00.000Z`)
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    filtered = filtered.lt(column, nextDay.toISOString())
  }
  return filtered
}

function clientName(row: SearchRow): string | null {
  const relation = Array.isArray(row.clients) ? row.clients[0] : row.clients
  return relation?.business_name ?? null
}

function mapRow(
  type: SearchEntityType,
  row: SearchRow,
): SearchResult {
  if (type === 'client') {
    return {
      id: row.id,
      type,
      title: row.business_name ?? '',
      subtitle: [row.nit, row.alias].filter(Boolean).join(' · '),
      status: row.active ? 'ACTIVE' : 'INACTIVE',
      date: row.created_at ?? null,
      clientId: row.id,
      clientName: row.business_name ?? null,
    }
  }

  if (type === 'sample') {
    return {
      id: row.id,
      type,
      title: row.code ?? '',
      subtitle: [row.plan_code, row.sampling_point].filter(Boolean).join(' · '),
      status: row.status ?? '',
      date: row.sampled_at ?? row.received_at ?? null,
      clientId: row.client_id ?? null,
      clientName: clientName(row),
    }
  }

  if (type === 'quote') {
    return {
      id: row.id,
      type,
      title: row.code ?? '',
      subtitle: clientName(row) ?? '',
      status: row.status ?? '',
      date: row.quote_date ?? null,
      clientId: row.client_id ?? null,
      clientName: clientName(row),
    }
  }

  return {
    id: row.id,
    type,
    title: row.code || `Reporte ${row.id.slice(0, 8)}`,
    subtitle: clientName(row) ?? '',
    status: row.status ?? '',
    date: row.created_at ?? null,
    clientId: row.client_id ?? null,
    clientName: clientName(row),
  }
}

function throwOnQueryError(result: QueryResult): SearchRow[] {
  if (result.error) {
    const error = new Error(result.error.message)
    Object.assign(error, { code: result.error.code })
    throw error
  }
  return result.data ?? []
}

function isMissingSchemaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = error.code
  return code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST205'
}

export { isMissingSchemaError }

export async function searchRecords(
  filters: SearchFilters,
  page: number,
): Promise<SearchPageResult> {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')

  const clientQuery = supabase
    .from('clients')
    .select('id, business_name, alias, nit, active, created_at', { count: 'exact' })
  const clientTerm = filters.term.trim()
  let filteredClients = clientQuery

  if (clientTerm) {
    const pattern = orPattern(clientTerm)
    filteredClients = filteredClients.or(
      `business_name.imatch.${pattern},alias.imatch.${pattern},nit.imatch.${pattern}`,
    )
  }
  if (filters.status === 'ACTIVE') filteredClients = filteredClients.eq('active', true)
  if (filters.status === 'INACTIVE') filteredClients = filteredClients.eq('active', false)
  if (filters.clientId) filteredClients = filteredClients.eq('id', filters.clientId)
  filteredClients = applyTimestampFilters(filteredClients, 'created_at', filters)
  const clientResult = await filteredClients
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(0, queryWindow(page).to)
  const clients = throwOnQueryError(clientResult as QueryResult)
  let clientIds = clients.map((row) => row.id)
  if (clientTerm) {
    let matchingClientIdsQuery = supabase
      .from('clients')
      .select('id')
      .or(
        `business_name.imatch.${orPattern(clientTerm)},alias.imatch.${orPattern(clientTerm)},nit.imatch.${orPattern(clientTerm)}`,
      )
    if (filters.clientId) matchingClientIdsQuery = matchingClientIdsQuery.eq('id', filters.clientId)
    const matchingClientIds = await matchingClientIdsQuery.range(0, 999)
    if (matchingClientIds.error) throw matchingClientIds.error
    clientIds = (matchingClientIds.data ?? []).map((row) => row.id)
  }

  const types: SearchEntityType[] = filters.type === 'all'
    ? filters.laboratoryId ? ['sample', 'report'] : ['sample', 'quote', 'report']
    : [filters.type]
  const requestResults = await Promise.all(
    types.map(async (type) => {
      if (type === 'client') return { type, rows: [] as SearchRow[], count: 0 }

      if (type === 'quote') {
        if (filters.laboratoryId) return { type, rows: [] as SearchRow[], count: 0 }
        let query = supabase!
          .from('quotes')
          .select('id, code, status, quote_date, client_id, clients(business_name)', { count: 'exact' })
        if (clientTerm) {
          const pattern = orPattern(clientTerm)
          query = query.or(
            `code.imatch.${pattern}${clientIds.length ? `,client_id.in.(${clientIds.join(',')})` : ''}`,
          )
        }
        if (filters.status) query = query.eq('status', filters.status)
        if (filters.clientId) query = query.eq('client_id', filters.clientId)
        if (filters.dateFrom) query = query.gte('quote_date', filters.dateFrom)
        if (filters.dateTo) query = query.lte('quote_date', filters.dateTo)
        const result = await query
          .order('quote_date', { ascending: false })
          .order('id', { ascending: true })
          .range(0, queryWindow(page).to)
        return { type, rows: throwOnQueryError(result as QueryResult), count: result.count ?? 0 }
      }

      if (type === 'sample') {
        let laboratorySampleIds: string[] | null = null
        if (filters.laboratoryId) {
          const labResult = await supabase!
            .from('sample_tests')
            .select('sample_id')
            .eq('assigned_laboratory_id', filters.laboratoryId)
          if (labResult.error) throw labResult.error
          laboratorySampleIds = [...new Set((labResult.data ?? []).map((row) => row.sample_id as string))]
          if (!laboratorySampleIds.length) return { type, rows: [], count: 0 }
        }

        let query = supabase!
          .from('samples')
          .select(
            'id, code, plan_code, sampling_point, status, sampled_at, received_at, client_id, clients(business_name)',
            { count: 'exact' },
          )
        if (clientTerm) {
          const pattern = orPattern(clientTerm)
          query = query.or(
            `code.imatch.${pattern},plan_code.imatch.${pattern},sampling_point.imatch.${pattern}${clientIds.length ? `,client_id.in.(${clientIds.join(',')})` : ''}`,
          )
        }
        if (filters.status) query = query.eq('status', filters.status)
        if (filters.clientId) query = query.eq('client_id', filters.clientId)
        if (laboratorySampleIds) query = query.in('id', laboratorySampleIds)
        query = applyTimestampFilters(query, 'sampled_at', filters)
        const result = await query
          .order('sampled_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: true })
          .range(0, queryWindow(page).to)
        return { type, rows: throwOnQueryError(result as QueryResult), count: result.count ?? 0 }
      }

      let reportSampleIds: string[] | null = null
      if (filters.laboratoryId) {
        const labResult = await supabase!
          .from('sample_tests')
          .select('sample_id')
          .eq('assigned_laboratory_id', filters.laboratoryId)
        if (labResult.error) throw labResult.error
        const sampleIds = [...new Set((labResult.data ?? []).map((row) => row.sample_id as string))]
        if (!sampleIds.length) return { type, rows: [], count: 0 }
        const reportSamples = await supabase!
          .from('report_samples')
          .select('report_id')
          .in('sample_id', sampleIds)
        if (reportSamples.error) throw reportSamples.error
        reportSampleIds = [...new Set((reportSamples.data ?? []).map((row) => row.report_id as string))]
        if (!reportSampleIds.length) return { type, rows: [], count: 0 }
      }

      let query = supabase!
        .from('reports')
        .select('id, code, status, client_id, created_at, clients(business_name)', { count: 'exact' })
      if (clientTerm) {
        const pattern = orPattern(clientTerm)
        query = query.or(
          `code.imatch.${pattern}${clientIds.length ? `,client_id.in.(${clientIds.join(',')})` : ''}`,
        )
      }
      if (filters.status) query = query.eq('status', filters.status)
      if (filters.clientId) query = query.eq('client_id', filters.clientId)
      if (reportSampleIds) query = query.in('id', reportSampleIds)
      query = applyTimestampFilters(query, 'created_at', filters)
      const result = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(0, queryWindow(page).to)
      return { type, rows: throwOnQueryError(result as QueryResult), count: result.count ?? 0 }
    }),
  )

  const allRows = [
    ...(
      (filters.type === 'all' || filters.type === 'client') && !filters.laboratoryId
        ? clients.map((row) => mapRow('client', row))
        : []
    ),
    ...requestResults.flatMap(({ type, rows }) => rows.map((row) => mapRow(type, row))),
  ].sort((left, right) => (right.date ?? '').localeCompare(left.date ?? ''))

  const includeClients =
    (filters.type === 'all' || filters.type === 'client') && !filters.laboratoryId
  const total =
    (includeClients ? clientResult.count ?? 0 : 0) +
    requestResults.reduce((sum, result) => sum + result.count, 0)
  const start = page * pageSize
  return { items: allRows.slice(start, start + pageSize), total }
}

export async function loadSearchFilterOptions(): Promise<{
  clients: { id: string; name: string }[]
  laboratories: { id: string; name: string }[]
}> {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  const [clients, laboratories] = await Promise.all([
    supabase.from('clients').select('id, business_name').order('business_name'),
    supabase.from('laboratories').select('id, name').order('name'),
  ])
  if (clients.error) throw clients.error
  if (laboratories.error) throw laboratories.error
  return {
    clients: (clients.data ?? []).map((client) => ({
      id: client.id,
      name: client.business_name,
    })),
    laboratories: laboratories.data ?? [],
  }
}
