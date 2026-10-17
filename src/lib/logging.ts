/**
 * Utilidades de observabilidad y logging de errores.
 * K04 - Requisitos 1.2, 1.3, 1.4, 2.1
 *
 * NUNCA registra datos sensibles: correos, tokens, keys, query params sensibles.
 */
import { supabase } from './supabase'

// ─── Versión de la aplicación (inyectada por Vite) ────────────────────────────
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev'

// ─── Límite de frecuencia: máx 10 errores por minuto por sesión ──────────────
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const logTimestamps: number[] = []

function isRateLimited(): boolean {
  const now = Date.now()
  // Eliminar entradas fuera de la ventana
  while (logTimestamps.length > 0 && logTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
    logTimestamps.shift()
  }
  if (logTimestamps.length >= RATE_LIMIT_MAX) return true
  logTimestamps.push(now)
  return false
}

// ─── Patrones de datos sensibles a eliminar ───────────────────────────────────
const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  // Correos electrónicos
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]'],
  // Tokens JWT (tres segmentos base64url)
  [/ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[JWT]'],
  // Claves de supabase (anon / service_role)
  [/eyJ[A-Za-z0-9+/=]{20,}/g, '[KEY]'],
  // Query params: ?token=..., ?key=..., ?password=..., ?apikey=...
  [/([?&])(token|key|password|apikey|api_key|secret|access_token)=[^&\s]*/gi, '$1$2=[REDACTED]'],
  // UUIDs con posible PII (conservar solo la estructura, no el valor)
  // No redactamos UUIDs genéricos porque son útiles para trazar
]

/**
 * Elimina datos sensibles de un string de mensaje o stack trace.
 * Req 1.3
 */
export function sanitize(input: string): string {
  let result = input
  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

/**
 * Genera un correlation ID único para trazar una acción a través del sistema.
 * Req 2.1
 */
export function newCorrelationId(): string {
  // Formato: xxxxxxxx-xxxx-4xxx (corto, legible en UI)
  return 'cid-' + crypto.randomUUID().slice(0, 13)
}

/**
 * Hash simple de un stack trace para agrupar errores iguales sin almacenar el stack.
 */
async function hashStack(stack: string): Promise<string | undefined> {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(stack.slice(0, 500))
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
  } catch {
    return undefined
  }
}

export interface LogClientErrorOptions {
  route: string
  error: unknown
  correlationId?: string
}

/**
 * Registra un error de cliente en la tabla client_error_logs.
 * Req 1.2, 1.4
 *
 * - Aplica límite de frecuencia (máx 10/min)
 * - Sanitiza el mensaje antes de enviar
 * - No lanza excepciones: el logging nunca debe romper el flujo
 */
export async function logClientError({
  route,
  error,
  correlationId,
}: LogClientErrorOptions): Promise<void> {
  if (isRateLimited()) return
  if (!supabase) return

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Error desconocido'

  const rawStack =
    error instanceof Error && error.stack ? error.stack : ''

  const message = sanitize(rawMessage)
  const stackHash = rawStack ? await hashStack(rawStack) : undefined

  try {
    await supabase.from('client_error_logs').insert({
      route: sanitize(route),
      message,
      stack_hash: stackHash ?? null,
      correlation_id: correlationId ?? null,
      app_version: APP_VERSION,
    })
  } catch {
    // Fallo silencioso: no romper la UI por un error de logging
  }
}
