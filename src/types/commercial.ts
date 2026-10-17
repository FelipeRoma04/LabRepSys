export interface Client {
  id: string
  nit: string | null
  business_name: string
  alias: string | null
  address: string | null
  city: string | null
  preferred_regulation_note: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  client_id: string
  name: string
  job_title: string | null
  email: string | null
  phone: string | null
  active: boolean
}

export type QuoteStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED'

export interface Quote {
  id: string
  code: string
  client_id: string
  contact_id: string | null
  quote_date: string
  valid_until: string | null
  status: QuoteStatus
  decision_rule: string | null
  observations: string | null
  active: boolean
}

export interface QuoteTest {
  id?: string
  test_id: string
  matrix_id: string | null
  suggested_laboratory_id: string | null
  notes: string | null
}

export interface QuoteRegulation {
  id?: string
  regulation_name: string
  article: string | null
  activity: string | null
  discharge_type: 'ARD' | 'ARnD' | 'NA'
  decision_rule: string | null
  regulation_version_id?: string | null
  requires_confirmation: boolean
}

export interface SimilarClient {
  id: string
  business_name: string
  similarity_score: number
}

export interface QuoteDetail {
  quote: Quote
  tests: QuoteTest[]
  regulations: QuoteRegulation[]
}
