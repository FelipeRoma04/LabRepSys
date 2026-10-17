import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppLayout } from '../layouts/AppLayout'
import { AccessDeniedPage } from '../pages/AccessDeniedPage'
import { LoginPage } from '../pages/LoginPage'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { AuthProvider } from './AuthProvider'

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string } } | null,
  profile: {
    id: 'user-1',
    full_name: 'Ana Analista',
    email: 'ana@example.test',
    job_title: 'Analista',
    active: true,
  } as {
    id: string
    full_name: string
    email: string
    job_title: string
    active: boolean
  } | null,
  roles: [] as { role_code: string; roles: { name: string } }[],
  authCallback: null as ((event: string, session: unknown) => void) | null,
  signInError: null as Error | null,
}))

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: mocks.session },
        error: null,
      })),
      onAuthStateChange: vi.fn((callback: typeof mocks.authCallback) => {
        mocks.authCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signInWithPassword: vi.fn(async () => {
        if (mocks.signInError) return { error: mocks.signInError }
        mocks.session = { user: { id: 'user-1', email: 'ana@example.test' } }
        mocks.authCallback?.('SIGNED_IN', mocks.session)
        return { error: null }
      }),
      signOut: vi.fn(async () => {
        mocks.session = null
        mocks.authCallback?.('SIGNED_OUT', null)
        return { error: null }
      }),
    },
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: mocks.profile, error: null })),
        then: (
          resolve: (value: {
            data: typeof mocks.roles
            error: null
          }) => unknown,
        ) => Promise.resolve({ data: mocks.roles, error: null }).then(resolve),
      }
      return table === 'profiles' ? query : query
    }),
  },
  requiredSupabaseVariables: [],
  isSupabaseConfigured: () => true,
}))

function renderAuthApp(initialPath = '/') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/access-denied" element={<AccessDeniedPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <p>Datos privados de inicio</p>
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/auditoria"
            element={
              <ProtectedRoute allowedRoles={['AUDITOR']}>
                <p>Datos de auditoría</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('AuthProvider y rutas protegidas', () => {
  beforeEach(() => {
    mocks.session = null
    mocks.profile = {
      id: 'user-1',
      full_name: 'Ana Analista',
      email: 'ana@example.test',
      job_title: 'Analista',
      active: true,
    }
    mocks.roles = [{ role_code: 'ANALISTA', roles: { name: 'Analista' } }]
    mocks.authCallback = null
    mocks.signInError = null
  })

  it('restaura una sesión existente y muestra el perfil y los roles reales', async () => {
    mocks.session = { user: { id: 'user-1', email: 'ana@example.test' } }
    renderAuthApp()

    expect(screen.queryByText('Datos privados de inicio')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Verificando la sesión…')
    expect(await screen.findByText('Datos privados de inicio')).toBeInTheDocument()
    expect(screen.getByText('Ana Analista')).toBeInTheDocument()
    expect(screen.getByText('Analista')).toBeInTheDocument()
    expect(screen.queryByText('Verificando la sesión…')).not.toBeInTheDocument()
  })

  it('permite iniciar sesión y cerrar la sesión', async () => {
    const user = userEvent.setup()
    renderAuthApp('/login')
    await screen.findByRole('heading', { name: 'Iniciar sesión' })

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.test')
    await user.type(screen.getByLabelText('Contraseña'), 'clave-de-prueba')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByText('Datos privados de inicio')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  it('muestra el error de login sin exponer detalles técnicos adicionales', async () => {
    const user = userEvent.setup()
    mocks.signInError = new Error('Credenciales no válidas')
    renderAuthApp('/login')
    await screen.findByRole('heading', { name: 'Iniciar sesión' })

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.test')
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByText('Credenciales no válidas')).toBeInTheDocument()
  })

  it('bloquea al usuario inactivo con un mensaje claro', async () => {
    mocks.session = { user: { id: 'user-1', email: 'ana@example.test' } }
    mocks.profile = { ...mocks.profile!, active: false }
    renderAuthApp()

    expect(
      await screen.findByText(/Tu cuenta está inactiva/),
    ).toBeInTheDocument()
    expect(screen.queryByText('Datos privados de inicio')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('redirige sesiones anónimas al login y deniega rutas sin el rol requerido', async () => {
    const anonymousApp = renderAuthApp()
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    anonymousApp.unmount()

    mocks.session = { user: { id: 'user-1', email: 'ana@example.test' } }
    mocks.roles = []
    const { unmount } = renderAuthApp('/auditoria')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument()
    })
    expect(screen.queryByText('Datos de auditoría')).not.toBeInTheDocument()
    unmount()
  })
})
