import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResultsPendingPage } from './ResultsPendingPage'
import { getAxeViolations } from './a11yTestUtils'

const mocks = vi.hoisted(() => ({
  roles: [] as { code: string; name: string }[],
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: mocks.roles }),
}))

vi.mock('./PendingResultsPage', () => ({
  PendingResultsPage: () => <p>Lista protegida de ensayos pendientes</p>,
}))

vi.mock('./PendingExternalReportsPage', () => ({
  PendingExternalReportsPage: () => <p>Lista de reportes externos pendientes</p>,
}))

describe('pestañas de resultados pendientes', () => {
  it('mantiene navegación por flechas y no presenta violaciones axe', async () => {
    mocks.roles = [{ code: 'ANALISTA', name: 'Analista' }]
    const { container } = render(<main><ResultsPendingPage /></main>)

    const resultsTab = screen.getByRole('tab', { name: 'Ensayos sin resultado' })
    const externalTab = screen.getByRole('tab', { name: 'Reportes externos' })
    fireEvent.keyDown(resultsTab, { key: 'ArrowRight' })
    expect(externalTab).toHaveFocus()
    expect(externalTab).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(externalTab, { key: 'ArrowRight' })
    expect(resultsTab).toHaveFocus()
    expect(await getAxeViolations(container)).toEqual([])
  })
  it('muestra solo reportes externos a RECEPCION, sin consultar resultados sujetos a otro RLS', () => {
    mocks.roles = [{ code: 'RECEPCION', name: 'Recepción' }]
    render(<ResultsPendingPage />)

    expect(screen.queryByRole('tab', { name: 'Ensayos sin resultado' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Reportes externos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Lista de reportes externos pendientes')).toBeInTheDocument()
    expect(screen.queryByText('Lista protegida de ensayos pendientes')).not.toBeInTheDocument()
  })

  it('conserva la cola de ensayos para ANALISTA', () => {
    mocks.roles = [{ code: 'ANALISTA', name: 'Analista' }]
    render(<ResultsPendingPage />)

    expect(screen.getByRole('tab', { name: 'Ensayos sin resultado' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Lista protegida de ensayos pendientes')).toBeInTheDocument()
  })
})
