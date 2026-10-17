import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { useAuth } from '../hooks/useAuth'

interface LoginLocationState {
  from?: string
}

export function LoginPage() {
  const { status, login, loginError, clearLoginError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const location = useLocation()
  const returnTo = (location.state as LoginLocationState | null)?.from ?? '/'

  if (status === 'loading') {
    return <LoadingState message="Restaurando la sesión…" />
  }
  if (status === 'authenticated') return <Navigate replace to={returnTo} />
  if (status === 'inactive') return <Navigate replace to="/access-denied" />

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearLoginError()
    setIsSubmitting(true)
    try {
      await login(email.trim(), password)
    } catch {
      // The provider exposes the Supabase error in loginError for the form.
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="standalone-page">
      <section className="login-card" aria-labelledby="login-title">
        <p className="login-brand">ReportSysDev</p>
        <h1 id="login-title">Iniciar sesión</h1>
        <p className="login-description">
          Ingresa con la cuenta que te fue invitada al sistema.
        </p>
        {loginError && <ErrorState message={loginError} title="Error de inicio de sesión" />}
        <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="login-email">Correo electrónico</label>
          <input
            autoComplete="username"
            id="login-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <label htmlFor="login-password">Contraseña</label>
          <input
            autoComplete="current-password"
            id="login-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  )
}
