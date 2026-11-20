/**
 * /auth/set-password — crear (invitación) o cambiar (recuperación o usuario
 * con sesión) la contraseña. Exige una sesión válida.
 */
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { useAuth } from '../hooks/useAuth'
import {
  INVALID_LINK_MESSAGE,
  PASSWORD_MIN_LENGTH,
  passwordUpdateErrorMessage,
  validateNewPassword,
  type EmailOtpType,
} from '../lib/authFlow'
import { updatePassword } from '../services/auth'

interface SetPasswordState {
  purpose?: EmailOtpType
}

export function SetPasswordPage() {
  const { status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const purpose = (location.state as SetPasswordState | null)?.purpose
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  if (status === 'loading') return <LoadingState message="Verificando la sesión…" />

  const hasSession = status === 'authenticated' || status === 'inactive'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const problem = validateNewPassword(password, confirmation)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updatePassword(password)
      setPassword('')
      setConfirmation('')
      setDone(true)
    } catch (cause) {
      setError(passwordUpdateErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  const title = purpose === 'invite' ? 'Crear contraseña' : 'Cambiar contraseña'

  return (
    <main className="standalone-page">
      <section className="login-card" aria-labelledby="set-password-title">
        <p className="login-brand">ReportSysDev</p>
        <h1 id="set-password-title">{title}</h1>
        {!hasSession ? (
          <>
            <ErrorState message={INVALID_LINK_MESSAGE} title="Sesión no válida" />
            <p className="login-description"><Link to="/forgot-password">Solicitar un enlace nuevo</Link></p>
          </>
        ) : done ? (
          <>
            <p role="status">Contraseña guardada correctamente.</p>
            <button onClick={() => navigate(status === 'inactive' ? '/access-denied' : '/', { replace: true })} type="button">
              Entrar al sistema
            </button>
          </>
        ) : (
          <>
            <p className="login-description">
              Usa al menos {PASSWORD_MIN_LENGTH} caracteres. Una frase larga es más segura que una palabra con símbolos.
            </p>
            {error && <ErrorState message={error} title="No se pudo guardar la contraseña" />}
            <form className="login-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
              <label htmlFor="new-password">Nueva contraseña</label>
              <input autoComplete="new-password" id="new-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
              <label htmlFor="confirm-password">Confirmar contraseña</label>
              <input autoComplete="new-password" id="confirm-password" onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} />
              <button disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar contraseña'}</button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
