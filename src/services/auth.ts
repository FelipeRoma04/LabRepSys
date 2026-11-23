/**
 * Operaciones de Supabase Auth para el flujo de contraseñas.
 * Los mensajes al usuario son genéricos: nunca revelan si un correo existe.
 */
import { supabase } from '../lib/supabase'
import {
  confirmRedirectUrl,
  isNetworkError,
  type EmailOtpType,
} from '../lib/authFlow'

function client() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}

/**
 * Canjea el token del enlace del correo por una sesión.
 * Se llama solo cuando el usuario pulsa el botón (no al cargar la página),
 * para que los escáneres de enlaces del correo no consuman el token.
 */
export async function verifyEmailLink(tokenHash: string, type: EmailOtpType): Promise<void> {
  const { error } = await client().auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) throw error
}

/** Abre la sesión con los tokens que Supabase entrega en el fragmento del enlace */
export async function setSessionFromLink(accessToken: string, refreshToken: string): Promise<void> {
  const { error } = await client().auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (error) throw error
}

/**
 * Pide el correo de recuperación. Solo propaga errores de red: cualquier otro
 * resultado (correo inexistente, límite de envíos) se trata como éxito para
 * no revelar qué cuentas existen.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: confirmRedirectUrl(window.location),
    })
    if (error && isNetworkError(error)) throw error
  } catch (error) {
    if (isNetworkError(error)) throw error
  }
}

/** Fija la contraseña del usuario con la sesión actual (invitación o recuperación) */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password })
  if (error) throw error
}

export async function hasActiveSession(): Promise<boolean> {
  const { data, error } = await client().auth.getSession()
  if (error) return false
  return Boolean(data.session)
}
