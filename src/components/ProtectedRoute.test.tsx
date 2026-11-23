import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../lib/auth-context'
import { ProtectedRoute } from './ProtectedRoute'

const authState: { value: Partial<AuthContextValue> } = { value: {} }

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    profile: null,
    roles: [],
    loginError: null,
    authError: null,
    isSigningOut: false,
    login: vi.fn(),
    logout: vi.fn(),
    clearLoginError: vi.fn(),
    ...authState.value,
  }),
}))

function renderRoute(allowedRoles?: Parameters<typeof ProtectedRoute>[0]['allowedRoles']) {
  return render(
    <MemoryRouter>
      <ProtectedRoute allowedRoles={allowedRoles}>
        <p>Contenido protegido</p>
      </ProtectedRoute>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('explica que la cuenta activa aún no tiene rol', () => {
    authState.value = { roles: [] }
    renderRoute()

    expect(screen.getByRole('heading', { name: 'Tu cuenta aún no tiene rol' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
  })

  it('muestra el contenido cuando la cuenta tiene un rol permitido', () => {
    authState.value = { roles: [{ code: 'ANALISTA', name: 'Analista' }] }
    renderRoute(['ANALISTA'])

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })

  it('niega el acceso cuando el rol no está permitido en la sección', () => {
    authState.value = { roles: [{ code: 'ANALISTA', name: 'Analista' }] }
    renderRoute(['ADMIN'])

    expect(screen.getByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
  })
})
