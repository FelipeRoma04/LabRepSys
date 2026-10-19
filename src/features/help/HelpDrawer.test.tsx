import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '../../lib/auth-context'
import { HelpDrawer } from './HelpDrawer'

const auth: AuthContextValue = {
  status: 'authenticated',
  profile: null,
  roles: [{ code: 'ANALISTA', name: 'Analista' }],
  loginError: null,
  authError: null,
  isSigningOut: false,
  login: async () => undefined,
  logout: async () => undefined,
  clearLoginError: () => undefined,
}

function renderHelp(path = '/normativa') {
  const onClose = vi.fn()
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <button type="button">Abrir ayuda</button>
        <HelpDrawer open onClose={onClose} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return { onClose }
}

describe('HelpDrawer', () => {
  it('shows route guidance, filters the glossary, and limits role guidance to the current role', async () => {
    const user = userEvent.setup()
    renderHelp()

    expect(screen.getByRole('heading', { name: 'Normativa' })).toBeInTheDocument()
    expect(screen.getByText(/DP-007, DP-008, DP-009 y DP-010/)).toBeInTheDocument()
    expect(screen.getByText('ANALISTA:')).toBeInTheDocument()
    expect(screen.queryByText('ADMIN:')).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Buscar en el glosario' }), 'LCM')
    expect(screen.getByText('LCM', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.queryByText('RSA', { selector: 'dt' })).not.toBeInTheDocument()
  })

  it('closes with Escape', () => {
    const { onClose } = renderHelp('/')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
