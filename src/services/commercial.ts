import { supabase } from '../lib/supabase'
import type {
  Client,
  Contact,
  Quote,
  QuoteDetail,
  QuoteRegulation,
  QuoteTest,
  SimilarClient,
} from '../types/commercial'

function db() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

export async function listClients(): Promise<Client[]> {
  const { data, error } = await db()
    .from('clients')
    .select('*')
    .order('business_name')
  if (error) throw error
  return (data ?? []) as Client[]
}

export async function listContacts(clientId?: string): Promise<Contact[]> {
  let query = db().from('contacts').select('*').order('name')
  if (clientId) query = query.eq('client_id', clientId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Contact[]
}

export async function createClient(values: Partial<Client>): Promise<Client> {
  const { data, error } = await db()
    .from('clients')
    .insert(values)
    .select('*')
    .single()
  if (error) throw error
  return data as Client
}

export async function updateClient(id: string, values: Partial<Client>): Promise<void> {
  const { error } = await db().from('clients').update(values).eq('id', id)
  if (error) throw error
}

export async function findClientByNit(
  nit: string,
  excludeClientId: string | null,
): Promise<Client | null> {
  let query = db().from('clients').select('*').eq('nit', nit).limit(1)
  if (excludeClientId) query = query.neq('id', excludeClientId)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data as Client | null
}

export async function saveContact(
  clientId: string,
  values: Partial<Contact>,
  contactId?: string,
): Promise<void> {
  const query = db().from('contacts')
  const { error } = contactId
    ? await query.update(values).eq('id', contactId).eq('client_id', clientId)
    : await query.insert({ ...values, client_id: clientId })
  if (error) throw error
}

export async function setClientActive(id: string, active: boolean): Promise<void> {
  const { error } = await db().from('clients').update({ active }).eq('id', id)
  if (error) throw error
}

export async function setContactActive(id: string, active: boolean): Promise<void> {
  const { error } = await db().from('contacts').update({ active }).eq('id', id)
  if (error) throw error
}

export async function findSimilarClients(
  businessName: string,
  excludeClientId: string | null,
): Promise<SimilarClient[]> {
  const { data, error } = await db().rpc('find_similar_clients', {
    client_name: businessName,
    exclude_client_id: excludeClientId,
  })
  if (error) throw error
  return (data ?? []) as SimilarClient[]
}

export async function listQuotes(): Promise<Quote[]> {
  const { data, error } = await db()
    .from('quotes')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Quote[]
}

export async function listSelectableQuotes(): Promise<Quote[]> {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  const today = date.toISOString().slice(0, 10)
  const { data, error } = await db()
    .from('quotes')
    .select('*')
    .eq('active', true)
    .eq('status', 'ACTIVE')
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .order('code')
  if (error) throw error
  return (data ?? []) as Quote[]
}

export async function getQuoteDetail(id: string): Promise<QuoteDetail> {
  const [quoteResult, testsResult, regulationsResult] = await Promise.all([
    db().from('quotes').select('*').eq('id', id).single(),
    db().from('quote_tests').select('*').eq('quote_id', id).eq('active', true),
    db().from('quote_regulations').select('*').eq('quote_id', id).eq('active', true),
  ])
  if (quoteResult.error) throw quoteResult.error
  if (testsResult.error) throw testsResult.error
  if (regulationsResult.error) throw regulationsResult.error
  return {
    quote: quoteResult.data as Quote,
    tests: (testsResult.data ?? []) as QuoteTest[],
    regulations: (regulationsResult.data ?? []) as QuoteRegulation[],
  }
}

export interface QuotePayload {
  client_id: string
  contact_id: string | null
  quote_date: string
  valid_until: string | null
  decision_rule: string | null
  observations: string | null
  tests: QuoteTest[]
  regulations: QuoteRegulation[]
}

export async function saveQuote(
  quoteId: string | null,
  payload: QuotePayload,
): Promise<string> {
  const { data, error } = await db().rpc('save_quote', {
    target_quote_id: quoteId,
    payload,
  })
  if (error) throw error
  return data as string
}

export async function setQuoteStatus(id: string, status: Quote['status']): Promise<void> {
  const { error } = await db().rpc('set_quote_status', {
    target_quote_id: id,
    new_status: status,
  })
  if (error) throw error
}

export async function listQuoteOptions() {
  const [testsResult, matricesResult, laboratoriesResult, issuabilityResult] =
    await Promise.all([
      db().from('tests').select('id, code, parameter_name, active').eq('active', true).order('code'),
      db().from('matrices').select('id, code, name').eq('active', true).order('code'),
      db().from('laboratories').select('id, code, name').eq('active', true).order('code'),
      db().from('v_tests_issuable').select('id, issuable, missing_fields'),
    ])
  if (testsResult.error) throw testsResult.error
  if (matricesResult.error) throw matricesResult.error
  if (laboratoriesResult.error) throw laboratoriesResult.error
  if (issuabilityResult.error) throw issuabilityResult.error
  return {
    tests: testsResult.data ?? [],
    matrices: matricesResult.data ?? [],
    laboratories: laboratoriesResult.data ?? [],
    issuability: Object.fromEntries(
      (issuabilityResult.data ?? []).map((row) => [row.id, row]),
    ),
  }
}
