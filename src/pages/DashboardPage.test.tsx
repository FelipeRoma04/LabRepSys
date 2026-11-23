import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  loadDeadlineIndicators: vi.fn(),
  listLateExternalReports: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('../services/dashboardIndicators', () => ({
  loadDeadlineIndicators: mocks.loadDeadlineIndicators,
  listLateExternalReports: mocks.listLateExternalReports,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({
    data: {
      samples_received: 12,
      samples_pending: 2,
      reports: { DRAFT: 4, READY_FOR_REVIEW: 1, IN_REVIEW: 2 },
      execution: {},
      pending_external: {},
      recent: [],
    },
    error: null,
  })
  mocks.loadDeadlineIndicators.mockResolvedValue({ overdue: 3, dueSoon: 5, issue: null, alertBusinessDays: 3 })
  mocks.listLateExternalReports.mockResolvedValue([
    { shipment_id: 'sh-1', sample_code: 'AG0346', laboratory_name: 'AGQ', expected_at: '2026-11-01', days_overdue: 9 },
  ])
})

function card(label: string) {
  return screen.getByRole('heading', { name: label }).closest('article')
}

describe('Inicio', () => {
  it('muestra los indicadores operativos reales con enlace a su detalle', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Muestras recibidas' })).toBeInTheDocument()
    expect(card('Muestras recibidas')).toHaveTextContent('12')
    expect(card('RSA pendientes de revisión')).toHaveTextContent('3')
    expect(card('Entregas al cliente vencidas')).toHaveTextContent('3')
    expect(card('Entregas próximas a vencer (≤ 3 días hábiles)')).toHaveTextContent('5')
    expect(card('Reportes externos retrasados')).toHaveTextContent('1')
    expect(screen.getByText('AG0346 · AGQ')).toBeInTheDocument()
    expect(card('Reportes externos retrasados')?.querySelector('a')).toHaveAttribute('href', '/laboratorios-externos')
  })

  it('sigue mostrando el resumen si un indicador operativo falla', async () => {
    mocks.loadDeadlineIndicators.mockRejectedValue(new Error('Faltan los parámetros de días de entrega'))
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    expect(await screen.findByText(/Algunos indicadores no están disponibles: Faltan los parámetros/)).toBeInTheDocument()
    expect(card('Muestras recibidas')).toHaveTextContent('12')
    expect(screen.queryByRole('heading', { name: 'Entregas al cliente vencidas' })).not.toBeInTheDocument()
  })
})
