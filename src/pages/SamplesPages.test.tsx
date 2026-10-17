import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ReceptionPage } from './ReceptionPage'
import { SamplesPage } from './SamplesPage'

const mocks = vi.hoisted(() => ({
  listClients: vi.fn(),
  listSelectableQuotes: vi.fn(),
  getQuoteDetail: vi.fn(),
  getSampleOptions: vi.fn(),
  listSamples: vi.fn(),
  getSample: vi.fn(),
  saveSample: vi.fn(),
  importSampleRows: vi.fn(),
  previewSamplesCsv: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-router-dom')>()
  return { ...original, useNavigate: () => mocks.navigate }
})

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: [{ code: 'RECEPCION', name: 'Recepción' }] }),
}))

vi.mock('../services/commercial', () => ({
  listClients: mocks.listClients,
  listSelectableQuotes: mocks.listSelectableQuotes,
  getQuoteDetail: mocks.getQuoteDetail,
}))

vi.mock('../services/samples', () => ({
  getSampleOptions: mocks.getSampleOptions,
  listSamples: mocks.listSamples,
  getSample: mocks.getSample,
  saveSample: mocks.saveSample,
  importSampleRows: mocks.importSampleRows,
  previewSamplesCsv: mocks.previewSamplesCsv,
}))

const client = {
  id: 'client-1',
  nit: '900123456',
  business_name: 'Cliente de prueba',
  alias: null,
  address: null,
  city: null,
  preferred_regulation_note: null,
  active: true,
  created_at: '2026-10-16T00:00:00Z',
  updated_at: '2026-10-16T00:00:00Z',
}
const sample = {
  id: 'sample-1',
  code: 'AG0346',
  client_id: client.id,
  quote_id: null,
  matrix_id: 'matrix-1',
  plan_code: 'PLAN-1',
  sampling_point: 'Punto 1',
  sampled_at: '2026-10-16T10:00:00Z',
  received_at: '2026-10-16T11:00:00Z',
  status: 'RECEIVED',
  observations: null,
  client: { business_name: client.business_name, nit: client.nit },
  quote: null,
  matrix: { code: 'AG', name: 'Agua' },
  reception: {
    sample_id: 'sample-1',
    containers: [],
    preservation: {},
    received_by: 'user-1',
    chain_of_custody_verified: true,
    arrival_conditions: null,
    deviations: null,
    client_consulted_on_deviation: false,
    request_review: {
      capacity_verified: true,
      methods_verified: true,
      conformity_requested: false,
    },
    signature_reference: null,
  },
  tests: [{
    id: 'sample-test-1',
    test_id: 'test-1',
    execution_type: 'SA',
    assigned_laboratory_id: null,
    status: 'PENDING',
    test: { code: 'SA001', parameter_name: 'pH' },
    laboratory: null,
  }],
  events: [],
}
const quote = {
  id: 'quote-1',
  code: 'COT-0001-2026',
  client_id: client.id,
  contact_id: null,
  quote_date: '2026-10-16',
  valid_until: '2026-11-16',
  status: 'ACTIVE' as const,
  decision_rule: null,
  observations: null,
  active: true,
}
const quoteDetail = {
  quote,
  tests: [{
    id: 'quote-test-1',
    test_id: 'test-1',
    matrix_id: 'matrix-1',
    suggested_laboratory_id: null,
    notes: null,
  }],
  regulations: [{
    id: 'quote-reg-1',
    regulation_name: 'Norma sugerida',
    article: '5',
    activity: null,
    discharge_type: 'ARD' as const,
    decision_rule: null,
    requires_confirmation: true,
  }],
}
const options = {
  matrices: [{ id: 'matrix-1', code: 'AG', name: 'Agua' }],
  tests: [{ id: 'test-1', code: 'SA001', parameter_name: 'pH' }],
  laboratories: [{ id: 'lab-1', code: 'EXT', name: 'Laboratorio externo', laboratory_type: 'EXTERNAL' }],
  accreditedScopes: [],
  codePattern: '^AG[0-9]{4}$',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.navigate = vi.fn()
  mocks.listClients.mockResolvedValue([client])
  mocks.listSelectableQuotes.mockResolvedValue([quote])
  mocks.getQuoteDetail.mockResolvedValue(quoteDetail)
  mocks.getSampleOptions.mockResolvedValue(options)
  mocks.listSamples.mockResolvedValue([])
  mocks.getSample.mockResolvedValue(sample)
  mocks.saveSample.mockResolvedValue('sample-1')
  mocks.importSampleRows.mockResolvedValue({ imported_count: 1, errors: [] })
  mocks.previewSamplesCsv.mockResolvedValue([])
})

async function renderReception(edit = false) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[edit ? '/muestras/recepcion?edit=sample-1' : '/muestras/recepcion']}>
      <ReceptionPage />
    </MemoryRouter>,
  )
  await screen.findByText(edit ? /Editar recepción AG0346/ : 'Asistente de recepción en nueve pasos. Las sugerencias comerciales requieren confirmación.')
  return user
}

async function fillCode(user: ReturnType<typeof userEvent.setup>, code = 'AG0346') {
  await user.type(screen.getByLabelText('Código de muestra'), code)
  await user.click(screen.getByRole('button', { name: 'Siguiente' }))
}

async function selectClientAndContinue(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Cliente'), client.id)
  await user.click(screen.getByRole('button', { name: 'Siguiente' }))
}

async function fillSampleTimingAndContinue(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Matriz'), 'matrix-1')
  fireEvent.change(screen.getByLabelText('Fecha y hora de recepción'), { target: { value: '2026-10-16T11:00' } })
  await user.click(screen.getByRole('button', { name: 'Siguiente' }))
}

describe('recepción y búsqueda de muestras', () => {
  it('acepta AG0346 y rechaza AG00106 en el asistente', async () => {
    const user = await renderReception()
    await user.type(screen.getByLabelText('Código de muestra'), 'AG00106')
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('El código de muestra no cumple el patrón configurado.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Código de muestra'))
    await user.type(screen.getByLabelText('Código de muestra'), 'AG0346')
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByLabelText('Cliente')).toBeInTheDocument()
  })

  it('detecta un código de muestra duplicado antes de guardar', async () => {
    mocks.listSamples.mockResolvedValue([sample])
    const user = await renderReception()
    await user.type(screen.getByLabelText('Código de muestra'), 'AG0346')
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Ya existe una muestra con ese código.')).toBeInTheDocument()
  })

  it('requiere confirmación explícita antes de aplicar sugerencias de cotización', async () => {
    const user = await renderReception()
    await fillCode(user)
    await user.selectOptions(screen.getByLabelText('Cliente'), client.id)
    await user.selectOptions(screen.getByLabelText('Cotización vigente (opcional)'), quote.id)
    await screen.findByRole('button', { name: 'Confirmar y aplicar sugerencias' })

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Revise y confirme expresamente las sugerencias de la cotización.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar y aplicar sugerencias' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByLabelText('Matriz')).toBeInTheDocument()
  })

  it('advierte fechas futuras sin corregirlas', async () => {
    const user = await renderReception()
    await fillCode(user)
    await selectClientAndContinue(user)
    await user.selectOptions(screen.getByLabelText('Matriz'), 'matrix-1')
    fireEvent.change(screen.getByLabelText('Fecha y hora de recepción'), { target: { value: '2026-10-16T11:00' } })
    fireEvent.change(screen.getByLabelText('Fecha y hora de muestreo'), { target: { value: '2099-10-16T10:00' } })
    expect(await screen.findByText('La fecha de muestreo está en el futuro; verifique el dato.')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha y hora de muestreo')).toHaveValue('2099-10-16T10:00')
  })

  it('exige laboratorio cuando un ensayo se marca como subcontratado', async () => {
    const user = await renderReception()
    await fillCode(user)
    await selectClientAndContinue(user)
    await fillSampleTimingAndContinue(user)
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByLabelText(/SA001 · pH/))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.selectOptions(screen.getByLabelText('Tipo de ejecución'), 'SUBCONTRACTED')
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Asigne un laboratorio a cada ensayo subcontratado.')).toBeInTheDocument()
  })

  it('no permite avanzar con desviación sin constancia de consulta al cliente', async () => {
    const user = await renderReception()
    await fillCode(user)
    await selectClientAndContinue(user)
    await fillSampleTimingAndContinue(user)
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByLabelText(/SA001 · pH/))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByLabelText('Se identificó una desviación'))
    await user.type(screen.getByLabelText('Desviación'), 'Recipiente con daño')
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Describa la desviación y registre la consulta al cliente antes de avanzar.')).toBeInTheDocument()
  })

  it('guarda una recepción completa por RPC con las verificaciones explícitas', async () => {
    const user = await renderReception()
    await fillCode(user)
    await selectClientAndContinue(user)
    await fillSampleTimingAndContinue(user)
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByLabelText(/SA001 · pH/))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByLabelText('Verificación de capacidad registrada'))
    await user.click(screen.getByLabelText('Verificación de métodos registrada'))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Guardar recepción' }))

    expect(await screen.findByText('Muestra recibida correctamente.')).toBeInTheDocument()
    expect(mocks.saveSample).toHaveBeenCalledWith(null, expect.objectContaining({
      code: 'AG0346',
      client_id: client.id,
      matrix_id: 'matrix-1',
      tests: [{ test_id: 'test-1', execution_type: 'SA', assigned_laboratory_id: null }],
      request_review: expect.objectContaining({
        capacity_verified: true,
        methods_verified: true,
      }),
    }), null)
  })

  it('exige motivo para editar una recepción guardada', async () => {
    const user = await renderReception(true)
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios auditados' }))
    expect(screen.getByLabelText('Motivo del cambio posterior a recepción')).toBeRequired()
    expect(mocks.saveSample).not.toHaveBeenCalled()
  })

  it('permite buscar la muestra y abrir sus datos de campo y adjuntos', async () => {
    const user = userEvent.setup()
    mocks.listSamples.mockResolvedValue([sample])
    render(<MemoryRouter><SamplesPage /></MemoryRouter>)
    await screen.findByText('AG0346')
    await user.type(screen.getByLabelText(/Buscar código/), '900123456')
    expect(screen.getByText('AG0346')).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/Buscar código/))
    await user.click(screen.getByRole('button', { name: 'Detalle' }))
    await user.click(screen.getByRole('button', { name: 'Abrir datos de campo' }))
    expect(mocks.navigate).toHaveBeenCalledWith('/muestras/datos-de-campo?sample_id=sample-1')
    await user.click(screen.getByRole('button', { name: 'Ver adjuntos' }))
    expect(mocks.navigate).toHaveBeenCalledWith('/muestras/datos-de-campo?sample_id=sample-1')
  })
})
