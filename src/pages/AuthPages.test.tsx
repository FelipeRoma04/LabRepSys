import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GENERIC_RESET_MESSAGE, INVALID_LINK_MESSAGE } from '../lib/authFlow'
import { AuthConfirmPage } from './AuthConfirmPage'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { SetPasswordPage } from './SetPasswordPage'

const mocks = vi.hoisted(() => ({
  status: 'authenticated' as 'loading' | 'authenticated' | 'anonymous' | 'inactive' | 'error',
  verifyEmailLink: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ status: mocks.status }) }))
vi.mock('../services/auth', () => ({
  verifyEmailLink: mocks.verifyEmailLink,
  requestPasswordReset: mocks.requestPasswordReset,
  updatePassword: mocks.updatePassword,
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/confirm" element={<AuthConfirmPage />} />
        <Route path="/auth/set-password" element={<SetPasswordPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<h1>Login</h1>} />
        <Route path="/" element={<h1>Inicio</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.status = 'authenticated'
  mocks.verifyEmailLink.mockResolvedValue(undefined)
  mocks.requestPasswordReset.mockResolvedValue(undefined)
  mocks.updatePassword.mockResolvedValue(undefined)
})

describe('/auth/confirm', () => {
  it('no canjea el token al cargar: espera el clic en el botón', async () => {
    const user = userEvent.setup()
    renderAt('/auth/confirm?token_hash=hash-1&type=invite')

    expect(screen.getByRole('heading', { name: 'Activar tu cuenta' })).toBeInTheDocument()
    expect(mocks.verifyEmailLink).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(mocks.verifyEmailLink).toHaveBeenCalledWith('hash-1', 'invite')
    expect(await screen.findByRole('heading', { name: 'Crear contraseña' })).toBeInTheDocument()
  })

  it('muestra un mensaje genérico si el token venció o es inválido', async () => {
    const user = userEvent.setup()
    mocks.verifyEmailLink.mockRejectedValue(Object.assign(new Error('Token has expired or is invalid'), { code: 'otp_expired' }))
    renderAt('/auth/confirm?token_hash=viejo&type=recovery')

    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText(INVALID_LINK_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText(/Token has expired/)).not.toBeInTheDocument()
  })

  it('rechaza enlaces sin token sin llamar al servidor', () => {
    renderAt('/auth/confirm?type=invite')
    expect(screen.getByText(INVALID_LINK_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument()
  })
})

describe('/auth/set-password', () => {
  it('valida y guarda la contraseña', async () => {
    const user = userEvent.setup()
    renderAt('/auth/set-password')

    await user.type(screen.getByLabelText('Nueva contraseña'), 'corta')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'corta')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument()
    expect(mocks.updatePassword).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Nueva contraseña'))
    await user.clear(screen.getByLabelText('Confirmar contraseña'))
    await user.type(screen.getByLabelText('Nueva contraseña'), 'frase larga segura')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'frase larga segura')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    await waitFor(() => expect(mocks.updatePassword).toHaveBeenCalledWith('frase larga segura'))
    expect(await screen.findByText('Contraseña guardada correctamente.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Entrar al sistema' }))
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument()
  })

  it('sin sesión no muestra el formulario', () => {
    mocks.status = 'anonymous'
    renderAt('/auth/set-password')
    expect(screen.getByText(INVALID_LINK_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument()
  })

  it('traduce el error de contraseña débil del servidor', async () => {
    const user = userEvent.setup()
    mocks.updatePassword.mockRejectedValue(Object.assign(new Error('Password should be stronger'), { code: 'weak_password' }))
    renderAt('/auth/set-password')
    await user.type(screen.getByLabelText('Nueva contraseña'), 'frase larga segura')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'frase larga segura')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByText(/política de seguridad/)).toBeInTheDocument()
  })
})

describe('/forgot-password', () => {
  it('responde siempre con el mismo mensaje, exista o no el correo', async () => {
    const user = userEvent.setup()
    renderAt('/forgot-password')
    await user.type(screen.getByLabelText('Correo electrónico'), 'nadie@ejemplo.co')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))

    expect(mocks.requestPasswordReset).toHaveBeenCalledWith('nadie@ejemplo.co')
    expect(await screen.findByText(GENERIC_RESET_MESSAGE)).toBeInTheDocument()
  })

  it('solo avisa cuando falla la conexión', async () => {
    const user = userEvent.setup()
    mocks.requestPasswordReset.mockRejectedValue(new TypeError('Failed to fetch'))
    renderAt('/forgot-password')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@ejemplo.co')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByText(/No se pudo conectar/)).toBeInTheDocument()
  })
})
