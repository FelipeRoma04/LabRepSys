/**
 * /auth/confirm — destino de los enlaces de invitación y recuperación.
 *
 * El token NO se canjea al cargar la página: los filtros antispam y antivirus
 * de correo abren los enlaces para inspeccionarlos y gastarían el token de un
 * solo uso. Se canjea cuando la persona pulsa el botón.
 */
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState'
import { INVALID_LINK_MESSAGE, isNetworkError, parseConfirmLink } from '../lib/authFlow'
import { verifyEmailLink } from '../services/auth'

export function AuthConfirmPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const link = parseConfirmLink(location.search)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(link ? null : INVALID_LINK_MESSAGE)

  const handleContinue = async () => {
    if (!link) return
    setVerifying(true)
    setError(null)
    try {
      await verifyEmailLink(link.tokenHash, link.type)
      // Retira el token de la barra de direcciones y del historial.
      navigate('/auth/set-password', { replace: true, state: { purpose: link.type } })
    } catch (cause) {
      setError(isNetworkError(cause)
        ? 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
        : INVALID_LINK_MESSAGE)
    } finally {
      setVerifying(false)
    }
  }

  const title = link?.type === 'recovery' ? 'Restablecer contraseña' : 'Activar tu cuenta'

  return (
    <main className="standalone-page">
      <section className="login-card" aria-labelledby="confirm-title">
        <p className="login-brand">ReportSysDev</p>
        <h1 id="confirm-title">{title}</h1>
        {error && <ErrorState message={error} title="No se pudo validar el enlace" />}
        {link && (
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
