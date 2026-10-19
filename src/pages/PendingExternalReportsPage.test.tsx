import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PendingExternalReportsPage } from './PendingExternalReportsPage'
import type { PendingExternalReport } from '../types/externalShipments'

const mocks = vi.hoisted(() => ({
  roles: [{ code: 'RECEPCION', name: 'Recepción' }],
  listPendingExternalReports: vi.fn(),
  receiveExternalReport: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: mocks.roles }),
}))

vi.mock('../services/externalShipments', () => ({
  listPendingExternalReports: mocks.listPendingExternalReports,
  receiveExternalReport: mocks.receiveExternalReport,
}))

const report: PendingExternalReport = {
  shipment_id: 'shipment-1',
  sample_id: 'sample-1',
  sample_code: 'AG0101',
  client_id: 'client-1',
  client_name: 'Cliente de prueba',
  sampling_point: 'Pozo norte',
  laboratory_id: 'lab-1',
  laboratory_name: 'Laboratorio Uno',
  external_code: 'EXT-1',
  sent_at: '2026-10-18T10:00:00Z',
  expected_at: '2026-10-19T10:00:00Z',
  status: 'SENT',
  days_overdue: 3,
  observations: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PendingExternalReportsPage />
    </MemoryRouter>,
  )
}

describe('reportes externos pendientes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.roles = [{ code: 'RECEPCION', name: 'Recepción' }]
    mocks.listPendingExternalReports
      .mockResolvedValueOnce([report])
      .mockResolvedValue([ ])
    mocks.receiveExternalReport.mockResolvedValue(undefined)
  })

  it('agrupa por laboratorio, destaca retraso y al recibir lo retira de pendientes', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Laboratorio Uno' })).toBeInTheDocument()
    expect(screen.getByText('3 días')).toBeInTheDocument()
    expect(screen.getByText('Pozo norte')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Registrar recepción de reporte' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }))

    await waitFor(() => {
      expect(mocks.receiveExternalReport).toHaveBeenCalledWith('shipment-1', expect.any(String))
    })
    expect(await screen.findByText(/El registro dejó de aparecer en pendientes/)).toBeInTheDocument()
    expect(await screen.findByText('No hay reportes externos pendientes')).toBeInTheDocument()
  })

  it('oculta la acción de recepción a roles de solo lectura', async () => {
    mocks.roles = [{ code: 'JEFE_TECNICA_CALIDAD', name: 'Jefe técnico' }]
    mocks.listPendingExternalReports.mockReset().mockResolvedValue([report])
    renderPage()

    await screen.findByText('3 días')
    expect(screen.queryByRole('button', { name: 'Registrar recepción de reporte' })).not.toBeInTheDocument()
  })
})
