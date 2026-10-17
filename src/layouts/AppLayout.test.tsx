import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppLayout } from './AppLayout'

describe('AppLayout', () => {
  it('renders the shell and navigates between routes', () => {
    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={['/']}
      >
        <AppLayout>
          <Routes>
            <Route path="/" element={<h1>Inicio</h1>} />
            <Route path="/clientes" element={<h1>Clientes</h1>} />
          </Routes>
        </AppLayout>
      </MemoryRouter>,
    )

    expect(screen.getByText('Laboratorio de Aguas y Alimentos')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Clientes' }))

    expect(screen.getByRole('heading', { name: 'Clientes' })).toBeInTheDocument()
  })
})
