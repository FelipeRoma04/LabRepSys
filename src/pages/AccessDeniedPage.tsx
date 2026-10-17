import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ErrorState } from '../components/ErrorState'

interface AccessDeniedPageProps {
  inactive?: boolean
}

export function AccessDeniedPage({ inactive = false }: AccessDeniedPageProps) {
  const { logout, isSigningOut, authError } = useAuth()
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const handleLogout = async () => {
    setLogoutError(null)
    try {
      await logout()
    } catch {
      setLogoutError('No se pudo cerrar la sesión. Intenta nuevamente.')
    }
  }

  return (
    <main className="standalone-page">
      <section className="state-panel" aria-labelledby="access-denied-title">
        <h1 id="access-denied-title">
          {inactive ? 'Cuenta pendiente de activación' : 'Acceso denegado'}
        </h1>
        <p>
          {inactive
            ? 'Tu cuenta está inactiva. Contacta a un administrador para solicitar su activación.'
            : 'Tu cuenta no tiene uno de los roles necesarios para acceder a esta sección.'}
        </p>
        {(logoutError || authError) && (
          <ErrorState message={logoutError ?? authError ?? ''} />
        )}
        <div className="standalone-actions">
          {inactive ? (
            <button
              disabled={isSigningOut}
              onClick={() => void handleLogout()}
              type="button"
            >
              {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          ) : (
            <Link to="/">Volver al inicio</Link>
          )}
        </div>
      </section>
    </main>
  )
}
