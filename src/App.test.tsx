import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: () => false,
  requiredSupabaseVariables: [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ],
}))

import App from './App'

describe('configuración de Supabase', () => {
  it('indica las variables faltantes sin mostrar la aplicación protegida', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Conexión pendiente de configuración' }),
    ).toBeInTheDocument()
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument()
    expect(screen.getByText('VITE_SUPABASE_ANON_KEY')).toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
  })
})
