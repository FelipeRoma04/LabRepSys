import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportBuilderPage } from './ReportBuilderPage'

const { getReportBuilderOptions, saveReportDraft } = vi.hoisted(() => ({
  getReportBuilderOptions: vi.fn(),
  saveReportDraft: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    profile: { id: 'analyst-1' },
    roles: [{ code: 'ANALISTA', name: 'Analista' }],
  }),
}))

vi.mock('../services/reports', () => ({
  getReport: vi.fn(),
}))

vi.mock('../services/reportBuilder', () => ({
  getReportBuilderOptions,
  getReportComposition: vi.fn(),
  saveReportDraft,
}))

describe('constructor de reportes RSA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getReportBuilderOptions.mockResolvedValue({
      samples: [{
        id: 'sample-1',
        code: 'AG0346',
        client_id: 'client-1',
        client: { business_name: 'Cliente demo' },
        matrix: { name: 'Agua' },
        sampled_at: '2026-10-01T12:00:00Z',
        received_at: '2026-10-02T12:00:00Z',
        sampling_point: 'Punto 1',
        observations: null,
      }],
      results: [{
        id: 'result-1',
        sample_id: 'sample-1',
        test_id: 'test-1',
        operator: '<',
        numeric_value: 0.04,
        original_text: '< 0,040',
        reported_text: null,
        unit: 'mg/L',
        lcm: 0.04,
        uncertainty_text: null,
        method_text: 'Método A',
        technique_text: 'Técnica A',
        accreditation_type: 'ACCREDITED',
        analysis_start: null,
        analysis_end: null,
        test: { code: 'SA001', parameter_name: 'Parámetro A' },
        laboratory: { name: 'Laboratorio interno' },
        execution_type: 'SA',
        assigned_laboratory: { name: 'Laboratorio interno' },
      }],
      regulations: [],
      clients: [{ id: 'client-1', business_name: 'Cliente demo' }],
      contacts: [],
      templates: [{ id: 'template-1', code: 'PL-01', version: 1 }],
    })
    saveReportDraft.mockResolvedValue('report-1')
  })

  it('selecciona muestras, carga sus resultados y guarda un borrador', async () => {
    render(
      <MemoryRouter initialEntries={['/reportes/nuevo']}>
        <Routes>
          <Route path="/reportes/nuevo" element={<ReportBuilderPage />} />
          <Route path="/reportes/:id" element={<p>Reporte guardado</p>} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText(/AG0346/)
    fireEvent.click(screen.getByRole('checkbox', { name: /AG0346/ }))

    expect(await screen.findByText(/SA001/)).toBeInTheDocument()
    expect(screen.getByText(/0,040/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Plantilla aprobada'), { target: { value: 'template-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    await waitFor(() => expect(saveReportDraft).toHaveBeenCalledWith({
      reportId: null,
      clientId: 'client-1',
      contactId: null,
      templateId: 'template-1',
      sampleIds: ['sample-1'],
      resultIds: ['result-1'],
    }))
    expect(await screen.findByText('Reporte guardado')).toBeInTheDocument()
  })
})
