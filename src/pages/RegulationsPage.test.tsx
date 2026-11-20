import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RegulationsPage } from './RegulationsPage'

const mocks = vi.hoisted(() => ({
  roles: [{ code: 'ANALISTA', name: 'Analista' }],
  activateRegulationVersion: vi.fn(),
  confirmSampleRegulations: vi.fn(),
  getRegulationCatalog: vi.fn(),
  importRegulationCsv: vi.fn(),
  listRegulationSamples: vi.fn(),
  listSampleRegulations: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: mocks.roles }),
}))

vi.mock('../services/regulations', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/regulations')>()
  return {
    ...original,
    activateRegulationVersion: mocks.activateRegulationVersion,
    confirmSampleRegulations: mocks.confirmSampleRegulations,
    getRegulationCatalog: mocks.getRegulationCatalog,
    importRegulationCsv: mocks.importRegulationCsv,
    listRegulationSamples: mocks.listRegulationSamples,
    listSampleRegulations: mocks.listSampleRegulations,
  }
})

const catalog = {
  regulations: [{ id: 'reg-1', code: 'RES_631_2015', name: 'Resolución 631 de 2015', source_reference: 'MADS' }],
  versions: [{ id: 'version-1', regulation_id: 'reg-1', version_name: 'Versión oficial cargada', status: 'ACTIVE', valid_from: null, valid_until: null }],
  activities: [
    { id: 'activity-ard', regulation_version_id: 'version-1', article: '8', activity: 'Actividad ARD', discharge_type: 'ARD', description: null },
    { id: 'activity-arnd', regulation_version_id: 'version-1', article: '9', activity: 'Actividad ARnD', discharge_type: 'ARnD', description: null },
  ],
  limits: [{
    id: 'limit-nr',
    activity_id: 'activity-ard',
    test_id: 'test-1',
    limit_operator: null,
    limit_value: null,
    limit_text: null,
    unit: null,
    special_value: 'N_R',
    test: { code: 'SA-001', parameter_name: 'Parámetro' },
  }],
}

const sample = {
  id: 'sample-1',
  code: 'AG0346',
  quote_id: 'quote-1',
  quote: { code: 'COT-0001-2026' },
  matrix: { code: 'ARD', name: 'Agua residual doméstica' },
  reception: { request_review: { quote_suggestions: { regulations: [] } } },
}

function renderPage() {
  return render(<RegulationsPage />)
}

describe('normativa y límites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.roles = [{ code: 'ANALISTA', name: 'Analista' }]
    mocks.getRegulationCatalog.mockResolvedValue(catalog)
    mocks.listRegulationSamples.mockResolvedValue([sample])
    mocks.listSampleRegulations.mockResolvedValue([])
    mocks.confirmSampleRegulations.mockResolvedValue({ confirmedCount: 1, quoteDifference: false })
    mocks.activateRegulationVersion.mockResolvedValue(undefined)
  })

  it('muestra valores especiales separados del cero y las decisiones pendientes', async () => {
    renderPage()

    expect(await screen.findByRole('cell', { name: 'N.R.' })).toBeInTheDocument()
    expect(screen.getByText(/DP-007, DP-008, DP-009 y DP-010/)).toBeInTheDocument()
  })

  it('confirma una columna normativa por muestra y conserva el orden seleccionado', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(await screen.findByLabelText('Muestra'), 'sample-1')
    await user.click(screen.getByLabelText(/Actividad ARD/))
    await user.click(screen.getByRole('button', { name: 'Confirmar normativa seleccionada' }))

    await waitFor(() => expect(mocks.confirmSampleRegulations).toHaveBeenCalledWith(
      'sample-1',
      ['activity-ard'],
      '',
    ))
  })

  it('advierte sobre tipo de descarga incoherente y obliga a registrar el motivo frente a cotización', async () => {
    const user = userEvent.setup()
    mocks.listRegulationSamples.mockResolvedValue([{
      ...sample,
      reception: {
        request_review: {
          quote_suggestions: {
            regulations: [{
              regulation_name: 'Resolución 631 de 2015',
              article: '8',
              activity: 'Actividad ARD',
              discharge_type: 'ARD',
            }],
          },
        },
      },
    }])
    renderPage()
    await user.selectOptions(await screen.findByLabelText('Muestra'), 'sample-1')
    await user.click(screen.getByLabelText(/Actividad ARnD/))

    expect(screen.getByText(/La selección difiere de la normativa acordada/)).toBeInTheDocument()
    expect(screen.getByText(/matriz indicada en recepción/)).toBeInTheDocument()
    const confirmButton = screen.getByRole('button', { name: 'Confirmar normativa seleccionada' })
    expect(confirmButton).toBeDisabled()

    await user.type(screen.getByLabelText('Motivo obligatorio'), 'Selección validada con el cliente')
    await user.click(confirmButton)
    await waitFor(() => expect(mocks.confirmSampleRegulations).toHaveBeenCalledWith(
      'sample-1',
      ['activity-arnd'],
      'Selección validada con el cliente',
    ))
  })

  it('limita la administración y la importación a ADMIN', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Versiones y actividades' })

    expect(screen.queryByRole('button', { name: 'Descargar plantilla CSV' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importar como borrador' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Activar/ })).not.toBeInTheDocument()
  })
})
