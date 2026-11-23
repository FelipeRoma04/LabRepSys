/**
 * Lógica pura del flujo de contraseñas (invitación, recuperación, cambio).
 *
 * La app usa HashRouter (GitHub Pages), así que los enlaces de correo llegan como
 *   https://<sitio>/LabRepSys/#/auth/confirm?token_hash=<hash>&type=invite|recovery
 * Las plantillas de correo de Supabase deben apuntar ahí (ver docs/AUTH_CONTRASENAS.md).
 */

export type EmailOtpType = 'invite' | 'recovery'

export interface ConfirmLinkParams {
  tokenHash: string
  type: EmailOtpType
}

/** Lee token_hash y type del query de la ruta (location.search de HashRouter) */
export function parseConfirmLink(search: string): ConfirmLinkParams | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const tokenHash = params.get('token_hash')?.trim()
  const type = params.get('type')
  if (!tokenHash || (type !== 'invite' && type !== 'recovery')) return null
  return { tokenHash, type }
}

/**
 * Con la plantilla de correo por defecto, Supabase canjea el enlace en su
 * servidor y redirige con los tokens (o el error) en un fragmento propio. Como
 * la app usa HashRouter, la URL queda con dos «#»:
 *   /#/auth/confirm#access_token=…&refresh_token=…&type=recovery
 *   /#/auth/confirm#error=access_denied&error_code=otp_expired&error_description=…
 * HashRouter entrega ese segundo fragmento en location.hash.
 */
export type ConfirmFragment =
  | { kind: 'session'; accessToken: string; refreshToken: string; type: string | null }
  | { kind: 'error'; error: string | null; errorCode: string | null; description: string | null }

/** Lee tokens o error del fragmento (location.hash) o del query de la ruta */
export function parseConfirmFragment(value: string): ConfirmFragment | null {
  const raw = value.startsWith('#') || value.startsWith('?') ? value.slice(1) : value
  if (!raw) return null
  const params = new URLSearchParams(raw)
  const error = params.get('error')
  const errorCode = params.get('error_code')
  if (error || errorCode) {
    return { kind: 'error', error, errorCode, description: params.get('error_description') }
  }
  const accessToken = params.get('access_token')?.trim()
  const refreshToken = params.get('refresh_token')?.trim()
  if (accessToken && refreshToken) {
    return { kind: 'session', accessToken, refreshToken, type: params.get('type') }
  }
  return null
}

/** Propósito de /auth/set-password según el type del enlace */
export function purposeFromLinkType(type: string | null): EmailOtpType | undefined {
  return type === 'invite' || type === 'recovery' ? type : undefined
}

export const EXPIRED_LINK_MESSAGE =
  'El enlace ya venció o ya se usó. Por seguridad, cada enlace sirve una sola vez y por tiempo limitado. Solicita uno nuevo desde «¿Olvidaste tu contraseña?».'

/** Mensaje claro para errores que Supabase devuelve en el enlace */
export function confirmFragmentErrorMessage(errorCode: string | null): string {
  return errorCode === 'otp_expired' ? EXPIRED_LINK_MESSAGE : INVALID_LINK_MESSAGE
}

/**
 * URL a la que Supabase redirige el correo de recuperación cuando la plantilla
 * usa {{ .RedirectTo }}. Conserva el subdirectorio de GitHub Pages (/LabRepSys/).
 */
export function confirmRedirectUrl(location: Pick<Location, 'origin' | 'pathname'>): string {
  const base = location.pathname.endsWith('/') ? location.pathname : `${location.pathname.replace(/[^/]*$/, '')}`
  return `${location.origin}${base}#/auth/confirm`
}

export const PASSWORD_MIN_LENGTH = 8
/** bcrypt (Supabase Auth) ignora lo que pase de 72 bytes */
export const PASSWORD_MAX_BYTES = 72

/** Devuelve el problema de la contraseña o null si es aceptable */
export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `La contraseña no puede superar ${PASSWORD_MAX_BYTES} bytes.`
  }
  if (password.trim() !== password) {
    return 'La contraseña no puede empezar ni terminar con espacios.'
  }
  if (password !== confirmation) {
    return 'Las contraseñas no coinciden.'
  }
  return null
}

/** Mensaje único para cualquier fallo de inicio de sesión (no revela si el correo existe) */
export const GENERIC_LOGIN_ERROR = 'Correo o contraseña incorrectos, o la cuenta no está habilitada.'
/** Mensaje único tras pedir recuperación, exista o no el correo */
export const GENERIC_RESET_MESSAGE =
  'Si el correo está registrado, recibirás un enlace para restablecer la contraseña. Revisa también la carpeta de spam.'
/** Mensaje único para enlaces vencidos, usados o manipulados */
export const INVALID_LINK_MESSAGE =
  'El enlace no es válido o ya venció. Solicita uno nuevo desde «¿Olvidaste tu contraseña?».'

/** true si el error parece de red (en ese caso sí conviene decirlo) */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AuthRetryableFetchError' || /fetch|network|failed to fetch/i.test(error.message)
}

/** Traduce errores de actualización de contraseña sin filtrar detalles internos */
export function passwordUpdateErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return 'No se pudo conectar con el servidor. Intenta de nuevo.'
  const code = (error as { code?: string } | null)?.code
  if (code === 'weak_password') return 'La contraseña no cumple la política de seguridad del sistema. Usa una más larga o más compleja.'
  if (code === 'same_password') return 'La nueva contraseña debe ser distinta de la actual.'
  if (code === 'session_not_found' || code === 'session_expired') return INVALID_LINK_MESSAGE
  return 'No se pudo guardar la contraseña. Intenta de nuevo o solicita un enlace nuevo.'
}
