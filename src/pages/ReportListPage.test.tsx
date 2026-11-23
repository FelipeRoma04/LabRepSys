import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Report } from '../types/reports'
import { ReportListPage } from './ReportListPage'

const mocks = vi.hoisted(() => ({
  listReports: vi.fn(),
  voidReport: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: [{ code: 'JEFE_TECNICA_CALIDAD', name: 'Jefatura' }] }),
}))
vi.mock('../services/reports', () => ({
  listReports: mocks.listReports,
  transitionReport: vi.fn(),
  issueReport: vi.fn(),
  rectifyReport: vi.fn(),
  voidReport: mocks.voidReport,
  VOID_REASON_MIN_LENGTH: 10,
}))

function report(overrides: Partial<Report>): Report {
  return {
    id: 'r-1',
    version: 1,
    status: 'ISSUED',
    prepared_by: 'u-1',
    created_at: '2026-11-23T10:00:00Z',
    updated_at: '2026-11-23T10:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReportListPage statusFilter={['ISSUED']} title="Emitidos" description="Reportes emitidos" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.listReports.mockReset()
  mocks.voidReport.mockReset()
})

describe('ReportListPage', () => {
  it('marca como DEMO los reportes emitidos con la serie DEMO', async () => {
    mocks.listReports.mockResolvedValue([
      report({ id: 'r-demo', code: 'DEMO-0001-2026', is_demo: true }),
      report({ id: 'r-real', code: 'RSA 0107-2026', is_demo: false }),
    ])
    renderPage()

    expect(await screen.findByText('DEMO-0001-2026')).toBeInTheDocument()
    expect(screen.getByText('RSA 0107-2026')).toBeInTheDocument()
    expect(screen.getAllByText('DEMO')).toHaveLength(1)
  })

  it('anula un reporte emitido con motivo y recarga la lista', async () => {
    const user = userEvent.setup()
    mocks.listReports.mockResolvedValue([report({ id: 'r-9', code: 'RSA 0107-2026' })])
    mocks.voidReport.mockResolvedValue({ ok: true, code: 'RSA 0107-2026' })
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Anular' }))
    const confirm = screen.getByRole('button', { name: 'Confirmar anulación' })
    await user.type(screen.getByLabelText(/Motivo de la anulación/), 'corto')
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText(/Motivo de la anulación/), ' — error de transcripción')
    await user.click(confirm)

    expect(mocks.voidReport).toHaveBeenCalledWith('r-9', 'corto — error de transcripción')
    await waitFor(() => expect(mocks.listReports).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: 'Confirmar anulación' })).not.toBeInTheDocument()
  })

  it('muestra el motivo del rechazo del servidor sin cerrar el diálogo', async () => {
    const user = userEvent.setup()
    mocks.listReports.mockResolvedValue([report({ id: 'r-9', code: 'RSA 0107-2026' })])
    mocks.voidReport.mockResolvedValue({ ok: false, message: 'Quien preparó el reporte no puede anularlo.' })
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Anular' }))
    await user.type(screen.getByLabelText(/Motivo de la anulación/), 'Error de transcripción')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))

    expect(await screen.findByText('Quien preparó el reporte no puede anularlo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar anulación' })).toBeInTheDocument()
  })
})
