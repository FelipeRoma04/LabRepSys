/** Adds one traceable UUID to each Supabase PostgREST RPC request. */
export function createCorrelationFetch(fetchImplementation: typeof fetch): typeof fetch {
  return (input, init) => {
    const url = input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.toString()
        : input
    if (!/\/rest\/v1\/rpc\//.test(url)) return fetchImplementation(input, init)

    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value))
    if (!headers.has('x-correlation-id')) headers.set('x-correlation-id', crypto.randomUUID())
    return fetchImplementation(input, { ...init, headers })
  }
}
