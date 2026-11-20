import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticsPage } from './DiagnosticsPage'

const mocks = vi.hoisted(() => ({ roles: [{ code: 'ANALISTA', name: 'Analista' }] }))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: mocks.roles }),
}))

vi.mock('../lib/supabase', () => ({ supabase: null }))

describe('DiagnosticsPage access', () => {
  beforeEach(() => {
    mocks.roles = [{ code: 'ANALISTA', name: 'Analista' }]
  })

  it.each(['ANALISTA', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'])(
    'does not offer denied audit details to %s', (role) => {
      mocks.roles = [{ code: role, name: role }]
      render(<DiagnosticsPage />)

      expect(screen.getByRole('alert')).toHaveTextContent('Acceso denegado')
      expect(screen.queryByRole('tab', { name: 'Intentos denegados' })).not.toBeInTheDocument()
    },
  )

  it('offers denied audit details to ADMIN_TECNICO', () => {
    mocks.roles = [{ code: 'ADMIN_TECNICO', name: 'Administrador técnico' }]
    render(<DiagnosticsPage />)

    expect(screen.getByRole('tab', { name: 'Intentos denegados' })).toBeInTheDocument()
  })
})
