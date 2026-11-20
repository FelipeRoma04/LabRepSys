import { describe, expect, it, vi } from 'vitest'
import { createCorrelationFetch } from './correlationFetch'

describe('createCorrelationFetch', () => {
  it('adds a UUID to PostgREST RPC calls while preserving authorization headers', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'))
    const correlatedFetch = createCorrelationFetch(fetchImplementation)

    await correlatedFetch('https://example.supabase.co/rest/v1/rpc/save_quote', {
      method: 'POST',
      headers: { authorization: 'Bearer session' },
    })

    const headers = new Headers(fetchImplementation.mock.calls[0][1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer session')
    expect(headers.get('x-correlation-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('keeps an explicit correlation ID from callRpc', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'))
    const correlatedFetch = createCorrelationFetch(fetchImplementation)

    await correlatedFetch('https://example.supabase.co/rest/v1/rpc/approve_template', {
      headers: { 'x-correlation-id': '00000000-0000-4000-8000-000000000001' },
    })

    expect(new Headers(fetchImplementation.mock.calls[0][1]?.headers).get('x-correlation-id'))
      .toBe('00000000-0000-4000-8000-000000000001')
  })

  it('does not add correlation headers to ordinary REST table requests', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'))
    const correlatedFetch = createCorrelationFetch(fetchImplementation)

    await correlatedFetch('https://example.supabase.co/rest/v1/clients')

    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/clients', undefined,
    )
  })
})
