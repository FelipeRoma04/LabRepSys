import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

interface LoginLocationState {
  from?: string
}

function parseHashParams(): URLSearchParams {
  const hash = window.location.hash
  const tokenIndex = hash.indexOf('access_token=')
  if (tokenIndex < 0) return new URLSearchParams()

  // HashRouter puede dejar la ruta (#/login) antes del fragmento que envía Supabase.
  const queryStart = hash.lastIndexOf('?', tokenIndex)
  const paramsStart = queryStart >= 0 ? queryStart + 1 : tokenIndex
  return new URLSearchParams(hash.slice(paramsStart).replace(/^#/, ''))
}

export function LoginPage() {
  const { status, login, loginError, clearLoginError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const location = useLocation()
  const returnTo = (location.state as LoginLocationState | null)?.from ?? '/'
  const [tokenType, setTokenType] = useState<'invite' | 'recovery' | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [settingPassword, setSettingPassword] = useState(false)
  const [processingInvite, setProcessingInvite] = useState(() => {
    const params = parseHashParams()
    const type = params.get('type')
    return Boolean(params.get('access_token') && (type === 'invite' || type === 'recovery'))
  })

  useEffect(() => {
    const params = parseHashParams()
    const accessToken = params.get('access_token')
    const type = params.get('type')
    if (!accessToken || (type !== 'invite' && type !== 'recovery') || !supabase) return

    void supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: params.get('refresh_token') ?? '',
    }).then(({ error }) => {
      if (error) {
        setPasswordError('El enlace venció o no es válido. Solicita una nueva invitación.')
        return
      }
      setTokenType(type)
      // Retira los tokens de la barra de direcciones tras validarlos.
      window.history.replaceState(null, '', `${window.location.pathname}#/login`)
    }).catch(() => {
      setPasswordError('No se pudo validar el enlace. Solicita una nueva invitación.')
    }).finally(() => setProcessingInvite(false))
  }, [])

  const handleSetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordError(null)
    if (newPassword.length < 8) {
      setPasswordError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError('Las contraseñas no coinciden.')
      return
    }
    if (!supabase) return
    setSettingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPasswordSuccess(true)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Error al establecer la contraseña.')
    } finally {
      setSettingPassword(false)
    }
  }

  if (processingInvite) return <LoadingState message="Validando el enlace de invitación…" />
  if (!tokenType && status === 'loading') return <LoadingState message="Restaurando la sesión…" />
  if (!tokenType && status === 'authenticated') return <Navigate replace to={returnTo} />
  if (!tokenType && status === 'inactive') return <Navigate replace to="/access-denied" />

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearLoginError()
    setIsSubmitting(true)
    try {
      await login(email.trim(), password)
    } catch {
      // El proveedor expone el error de Supabase en loginError.
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="standalone-page">
      <section className="login-card" aria-labelledby="login-title">
        <p className="login-brand">ReportSysDev</p>
        {tokenType ? (
          <>
            <h1 id="login-title">Crear contraseña</h1>
            <p className="login-description">
              {tokenType === 'invite' ? 'Define una contraseña para activar tu cuenta.' : 'Escribe tu nueva contraseña.'}
            </p>
            {passwordError && <ErrorState message={passwordError} title="No se pudo crear la contraseña" />}
            {passwordSuccess ? (
              <>
                <p role="status">Contraseña creada. Ya puedes iniciar sesión.</p>
                <button onClick={() => setTokenType(null)} type="button">Ir a iniciar sesión</button>
              </>
            ) : (
              <form className="login-form" onSubmit={(event) => void handleSetPassword(event)}>
                <label htmlFor="new-password">Nueva contraseña</label>
                <input autoComplete="new-password" id="new-password" minLength={8} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} />
                <label htmlFor="confirm-password">Confirmar contraseña</label>
                <input autoComplete="new-password" id="confirm-password" onChange={(event) => setNewPasswordConfirm(event.target.value)} required type="password" value={newPasswordConfirm} />
                <button disabled={settingPassword} type="submit">{settingPassword ? 'Guardando…' : 'Guardar contraseña'}</button>
              </form>
            )}
          </>
        ) : (
          <>
            <h1 id="login-title">Iniciar sesión</h1>
            <p className="login-description">Ingresa con la cuenta que te fue invitada al sistema.</p>
            {passwordError && <ErrorState message={passwordError} title="Enlace no válido" />}
            {loginError && <ErrorState message={loginError} title="Error de inicio de sesión" />}
            <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
              <label htmlFor="login-email">Correo electrónico</label>
              <input autoComplete="username" id="login-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
              <label htmlFor="login-password">Contraseña</label>
              <input autoComplete="current-password" id="login-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
              <button disabled={isSubmitting} type="submit">{isSubmitting ? 'Ingresando…' : 'Ingresar'}</button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
