/**
 * /forgot-password — solicita el correo de recuperación.
 * La respuesta es siempre la misma, exista o no la cuenta.
 */
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState'
import { GENERIC_RESET_MESSAGE } from '../lib/authFlow'
import { requestPasswordReset } from '../services/auth'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo en unos minutos.')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="standalone-page">
      <section className="login-card" aria-labelledby="forgot-title">
        <p className="login-brand">ReportSysDev</p>
        <h1 id="forgot-title">Recuperar contraseña</h1>
        {sent ? (
          <p role="status">{GENERIC_RESET_MESSAGE}</p>
        ) : (
          <>
            <p className="login-description">Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.</p>
            {error && <ErrorState message={error} title="No se pudo enviar" />}
            <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
              <label htmlFor="forgot-email">Correo electrónico</label>
              <input autoComplete="username" id="forgot-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
              <button disabled={sending} type="submit">{sending ? 'Enviando…' : 'Enviar enlace'}</button>
            </form>
          </>
        )}
        <p className="login-description"><Link to="/login">Volver a iniciar sesión</Link></p>
      </section>
    </main>
  )
}
