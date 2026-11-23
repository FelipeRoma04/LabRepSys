import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Report } from '../types/reports'
import { ReportListPage } from './ReportListPage'

const mocks = vi.hoisted(() => ({
  listReports: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: [{ code: 'JEFE_TECNICA_CALIDAD', name: 'Jefatura' }] }),
}))
vi.mock('../services/reports', () => ({
  listReports: mocks.listReports,
  transitionReport: vi.fn(),
  issueReport: vi.fn(),
  rectifyReport: vi.fn(),
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

beforeEach(() => {
  mocks.listReports.mockReset()
})

describe('ReportListPage', () => {
  it('marca como DEMO los reportes emitidos con la serie DEMO', async () => {
    mocks.listReports.mockResolvedValue([
      report({ id: 'r-demo', code: 'DEMO-0001-2026', is_demo: true }),
      report({ id: 'r-real', code: 'RSA 0107-2026', is_demo: false }),
    ])
    render(
      <MemoryRouter>
        <ReportListPage statusFilter={['ISSUED']} title="Emitidos" description="Reportes emitidos" />
      </MemoryRouter>,
    )

    expect(await screen.findByText('DEMO-0001-2026')).toBeInTheDocument()
    expect(screen.getByText('RSA 0107-2026')).toBeInTheDocument()
    expect(screen.getAllByText('DEMO')).toHaveLength(1)
  })
})
