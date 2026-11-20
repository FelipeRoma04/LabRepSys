import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportRecords } from '../lib/report'
import { ReportPrintPage } from './ReportPrintPage'

const mocks = vi.hoisted(() => ({
  loadReportPrintData: vi.fn(),
  listReportFiles: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ roles: [{ code: 'ANALISTA', name: 'Analista' }] }) }))
vi.mock('../services/reportPrint', () => ({ loadReportPrintData: mocks.loadReportPrintData }))
vi.mock('../services/reports', () => ({
  listReportFiles: mocks.listReportFiles,
  uploadFinalReportPdf: vi.fn(),
  getFinalReportPdfUrl: vi.fn(),
}))

const records: ReportRecords = {
  code: 'RSA 0106-2026',
  issued_at: '2026-07-10T14:00:00+00:00',
  template: { code: 'SA-OP-LAA-TEC-FOR.6.1', version: 6, approval_date: '2026-01-29' },
  client: { business_name: 'Cliente de prueba', nit: '000000000' },
  contact: { name: 'Contacto de prueba' },
  samples: [{ id: 's1', code: 'AG0346', sampling_point: 'SALIDA 1', sampled_at: '2026-05-29', received_at: '2026-06-01' }],
  results: [{
    id: 'r1', sample_id: 's1', test_id: 't1',
    original_text: '< 0,040', reported_text: '< 0,040', unit: 'µg/L', lcm: 0.04,
    method_text: 'EPA8270E', technique_text: 'GC/MS', accreditation_type: 'ACCREDITED',
    analysis_start: '2026-06-04', analysis_end: '2026-07-09',
    test: { code: 'HAP-01', parameter_name: 'Acenafteno' },
    laboratory: { id: 'agq', name: 'AGQ Colombia', report_code: 'SA2', accreditation_resolution: 'Resolución No. 1080 de 2025' },
    execution_type: 'SUBCONTRACTED', group_label: "HAP'S", display_order: 1, notes: [],
  }],
  regulations: [],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reportes/rep-1/imprimir']}>
      <Routes><Route path="/reportes/:id/imprimir" element={<ReportPrintPage />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listReportFiles.mockResolvedValue([])
})

describe('ReportPrintPage', () => {
  it('imprime un RSA emitido desde el snapshot con el formato del reporte', async () => {
    mocks.loadReportPrintData.mockResolvedValue({
      report: { id: 'rep-1', status: 'ISSUED', version: 1, prepared_by: 'u1', created_at: '', updated_at: '2026-07-10' },
      records,
      fromSnapshot: true,
      templateConfig: { signature: { signerTitle: 'Coordinadora LAA', signerNamePlaceholder: '' } },
      approvedByName: 'Firmante de prueba',
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Reporte N° RSA 0106-2026' })).toBeInTheDocument()
    expect(screen.getByText(/snapshot congelado/)).toBeInTheDocument()
    expect(screen.getByText('< 0,040')).toBeInTheDocument()
    expect(screen.getByText("HAP'S")).toBeInTheDocument()
    expect(screen.getByText('SA2')).toBeInTheDocument()
    expect(screen.getByText(/\(SA2\) AGQ Colombia/)).toBeInTheDocument()
    expect(screen.getByText('Firmante de prueba')).toBeInTheDocument()
    expect(screen.queryByLabelText('Revisión antes de emitir')).not.toBeInTheDocument()
    expect(screen.queryByText('BORRADOR')).not.toBeInTheDocument()
  })

  it('en borrador muestra marca de agua, problemas y decisiones pendientes', async () => {
    mocks.loadReportPrintData.mockResolvedValue({
      report: { id: 'rep-1', status: 'DRAFT', version: 1, prepared_by: 'u1', created_at: '', updated_at: '2026-07-01T10:00:00Z' },
      records: { ...records, code: null, issued_at: null, results: [{ ...records.results![0], method_text: null }] },
      fromSnapshot: false,
      templateConfig: null,
      approvedByName: null,
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Reporte N° BORRADOR (sin número)' })).toBeInTheDocument()
    expect(screen.getByText('BORRADOR')).toBeInTheDocument()
    expect(screen.getByText(/problema\(s\) impiden emitir/)).toBeInTheDocument()
    expect(screen.getByText(/no tiene método/)).toBeInTheDocument()
    expect(screen.getByText(/Decisiones pendientes que afectan este reporte/)).toBeInTheDocument()
  })

  it('muestra el error si el reporte emitido no tiene snapshot', async () => {
    mocks.loadReportPrintData.mockRejectedValue(new Error('El reporte está emitido pero no tiene snapshot: no se imprime desde datos vivos.'))
    renderPage()
    expect(await screen.findByText(/no tiene snapshot/)).toBeInTheDocument()
  })
})
