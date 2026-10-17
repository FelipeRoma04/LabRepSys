/**
 * Envoltorio de RPC para propagar correlation_id a las llamadas de Supabase.
 * K04 - Requisito 2.1
 *
 * Uso:
 *   const cid = newCorrelationId()
 *   await callRpc('transition_report', { report_id: id, to_status: 'IN_REVIEW' }, cid)
 *
 * El ID se conserva en el registro de errores del cliente; cada RPC mantiene
 * exactamente los parámetros definidos por su firma SQL.
 */
import { supabase } from '../lib/supabase'
import { logClientError, newCorrelationId as genId } from '../lib/logging'

interface RpcCallResult<T> {
  data: T | null
  error: Error | null
  correlationId: string
}

/**
 * Llama una RPC de Supabase sin alterar los parámetros definidos por su firma.
 * Siempre devuelve {data, error, correlationId} — nunca lanza.
 */
export async function callRpc<T = unknown>(
  fnName: string,
  params: Record<string, unknown> = {},
  correlationId?: string,
): Promise<RpcCallResult<T>> {
  const cid = correlationId ?? genId()

  if (!supabase) {
    return {
      data: null,
      error: new Error('La conexión con Supabase no está configurada.'),
      correlationId: cid,
    }
  }

  const { data, error } = await supabase.rpc(fnName, params)

  if (error) {
    await logClientError({
      route: `rpc:${fnName}`,
      error,
      correlationId: cid,
    })
    return { data: null, error: new Error(error.message), correlationId: cid }
  }

  return { data: data as T, error: null, correlationId: cid }
}
