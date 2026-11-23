/**
 * /auth/confirm — destino de los enlaces de invitación y recuperación.
 *
 * Admite dos formatos de enlace:
 * - token_hash (plantillas propias): el token NO se canjea al cargar la página,
 *   porque los filtros antispam y antivirus del correo abren los enlaces para
 *   inspeccionarlos y gastarían el token de un solo uso. Se canjea con el botón.
 * - Plantilla por defecto de Supabase: Supabase ya canjeó el enlace en su
 *   servidor y redirige con los tokens en un segundo fragmento
 *   (/#/auth/confirm#access_token=…). Aquí se abre la sesión al cargar, se
 *   quitan los tokens de la URL y se continúa a /auth/set-password.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import {
  INVALID_LINK_MESSAGE,
  confirmFragmentErrorMessage,
  isNetworkError,
  parseConfirmFragment,
  parseConfirmLink,
  purposeFromLinkType,
} from '../lib/authFlow'
import { setSessionFromLink, verifyEmailLink } from '../services/auth'

const NETWORK_MESSAGE = 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'

/** Quita tokens o errores del segundo fragmento de la barra de direcciones y del historial */
function stripLinkFragment() {
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, '', `${pathname}${search}#/auth/confirm`)
}

export function AuthConfirmPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const link = parseConfirmLink(location.search)
  const [fragment] = useState(() =>
    parseConfirmFragment(location.hash) ?? parseConfirmFragment(location.search),
  )
  // Con tokens en el fragmento, la sesión se abre al cargar: arranca validando.
  const [verifying, setVerifying] = useState(() => fragment?.kind === 'session')
  const [error, setError] = useState<string | null>(() => {
    if (fragment?.kind === 'error') return confirmFragmentErrorMessage(fragment.errorCode)
    return link || fragment ? null : INVALID_LINK_MESSAGE
  })
  const handledFragment = useRef(false)

  useEffect(() => {
    if (!fragment || handledFragment.current) return
    handledFragment.current = true
    stripLinkFragment()
    if (fragment.kind !== 'session') return

    // Sin cancelación: en StrictMode el efecto se monta dos veces y la guarda
    // useRef evita repetir la llamada, así que la primera debe completar.
    setSessionFromLink(fragment.accessToken, fragment.refreshToken)
      .then(() => {
        navigate('/auth/set-password', {
          replace: true,
          state: { purpose: purposeFromLinkType(fragment.type) },
        })
      })
      .catch((cause: unknown) => {
        setError(isNetworkError(cause) ? NETWORK_MESSAGE : INVALID_LINK_MESSAGE)
        setVerifying(false)
      })
  }, [fragment, navigate])

  const handleContinue = async () => {
    if (!link) return
    setVerifying(true)
    setError(null)
    try {
      await verifyEmailLink(link.tokenHash, link.type)
      // Retira el token de la barra de direcciones y del historial.
      navigate('/auth/set-password', { replace: true, state: { purpose: link.type } })
    } catch (cause) {
      setError(isNetworkError(cause) ? NETWORK_MESSAGE : INVALID_LINK_MESSAGE)
    } finally {
      setVerifying(false)
    }
  }

  const linkType = link?.type ?? (fragment?.kind === 'session' ? fragment.type : null)
  const title = linkType === 'recovery' ? 'Restablecer contraseña' : 'Activar tu cuenta'
  const openingSession = fragment?.kind === 'session' && verifying

  return (
    <main className="standalone-page">
      <section className="login-card" aria-labelledby="confirm-title">
        <p className="login-brand">ReportSysDev</p>
        <h1 id="confirm-title">{title}</h1>
        {error && <ErrorState message={error} title="No se pudo validar el enlace" />}
        {openingSession && <LoadingState message="Validando el enlace…" />}
        {link && !fragment && (
          <>
            <p className="login-description">
              {link.type === 'recovery'
                ? 'Pulsa el botón para continuar y elegir una contraseña nueva.'
                : 'Pulsa el botón para aceptar la invitación y crear tu contraseña.'}
            </p>
            <button disabled={verifying} onClick={() => void handleContinue()} type="button">
              {verifying ? 'Validando…' : 'Continuar'}
            </button>
          </>
        )}
        <p className="login-description">
          <Link to="/forgot-password">¿Necesitas un enlace nuevo?</Link> · <Link to="/login">Iniciar sesión</Link>
        </p>
      </section>
    </main>
  )
}
