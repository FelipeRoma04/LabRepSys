import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientsPage } from './ClientsPage'
import { QuotesPage } from './QuotesPage'

const mocks = vi.hoisted(() => ({
  listClients: vi.fn(),
  listContacts: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  findClientByNit: vi.fn(),
  findSimilarClients: vi.fn(),
  saveContact: vi.fn(),
  setClientActive: vi.fn(),
  setContactActive: vi.fn(),
  listQuotes: vi.fn(),
  listQuoteOptions: vi.fn(),
  getQuoteDetail: vi.fn(),
  saveQuote: vi.fn(),
  setQuoteStatus: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: [{ code: 'COMERCIAL', name: 'Comercial' }] }),
}))

vi.mock('../services/commercial', () => mocks)

const client = {
  id: 'client-1',
  nit: '900123456',
  business_name: 'Laboratorio de Prueba',
  alias: 'LDP',
  address: null,
  city: 'Bogotá',
  preferred_regulation_note: null,
  active: true,
  created_at: '2026-10-17T00:00:00Z',
  updated_at: '2026-10-17T00:00:00Z',
}

const quote = {
  id: 'quote-1',
  code: 'COT-0001-2026',
  client_id: 'client-1',
  contact_id: null,
  quote_date: '2026-10-17',
  valid_until: '2026-11-17',
  status: 'DRAFT' as const,
  decision_rule: null,
  observations: null,
  active: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listClients.mockResolvedValue([client])
  mocks.listContacts.mockResolvedValue([])
  mocks.createClient.mockResolvedValue(client)
  mocks.updateClient.mockResolvedValue(undefined)
  mocks.findClientByNit.mockResolvedValue(null)
  mocks.findSimilarClients.mockResolvedValue([])
  mocks.saveContact.mockResolvedValue(undefined)
  mocks.setClientActive.mockResolvedValue(undefined)
  mocks.setContactActive.mockResolvedValue(undefined)
  mocks.listQuotes.mockResolvedValue([])
  mocks.listQuoteOptions.mockResolvedValue({
    tests: [{ id: 'test-1', code: 'SA001', parameter_name: 'pH' }],
    matrices: [{ id: 'matrix-1', code: 'AG', name: 'Agua' }],
    laboratories: [{ id: 'lab-1', code: 'INT', name: 'Interno' }],
    issuability: {
      'test-1': { id: 'test-1', issuable: false, missing_fields: ['Método'] },
    },
  })
  mocks.getQuoteDetail.mockResolvedValue({
    quote,
    tests: [],
    regulations: [],
  })
  mocks.saveQuote.mockResolvedValue('quote-1')
  mocks.setQuoteStatus.mockResolvedValue(undefined)
})

describe('gestión comercial', () => {
  it('bloquea la creación de un cliente con NIT duplicado', async () => {
    const user = userEvent.setup()
    mocks.findClientByNit.mockResolvedValue(client)
    render(<ClientsPage />)
    await screen.findByText('Laboratorio de Prueba')
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    await user.type(screen.getByLabelText('Razón social'), 'Laboratorio Nuevo')
    await user.type(screen.getByLabelText('NIT'), client.nit)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(/Ya existe un cliente con ese NIT/)).toBeInTheDocument()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('advierte por similitud y permite confirmar la creación', async () => {
    const user = userEvent.setup()
    mocks.findSimilarClients.mockResolvedValue([{
      id: client.id,
      business_name: client.business_name,
      similarity_score: 0.42,
    }])
    render(<ClientsPage />)
    await screen.findByText('Laboratorio de Prueba')
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    await user.type(screen.getByLabelText('Razón social'), 'Laboratorio de Prueba Norte')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(/Se encontraron razones sociales similares/)).toBeInTheDocument()
    expect(mocks.createClient).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Continuar y guardar' }))
    await waitFor(() => expect(mocks.createClient).toHaveBeenCalledWith(expect.objectContaining({
      business_name: 'Laboratorio de Prueba Norte',
    })))
  })

  it('asocia contactos al cliente seleccionado', async () => {
    const user = userEvent.setup()
    render(<ClientsPage />)
    await screen.findByText('Laboratorio de Prueba')
    await user.click(screen.getByRole('button', { name: 'Detalle' }))
    await user.click(screen.getByRole('button', { name: 'Agregar contacto' }))
    await user.type(screen.getByLabelText('Nombre'), 'Ana Contacto')
    await user.type(screen.getByLabelText('Correo'), 'ana@example.test')
    await user.click(screen.getByRole('button', { name: 'Guardar contacto' }))

    await waitFor(() => expect(mocks.saveContact).toHaveBeenCalledWith(
      client.id,
      expect.objectContaining({ name: 'Ana Contacto', email: 'ana@example.test' }),
      undefined,
    ))
  })

  it('guarda ensayos y normativa como sugerencia confirmable en una cotización', async () => {
    const user = userEvent.setup()
    render(<QuotesPage />)
    await screen.findByText('No hay cotizaciones para mostrar')
    await user.click(screen.getByRole('button', { name: 'Nueva cotización' }))
    await user.selectOptions(screen.getByLabelText('Cliente'), client.id)
    await user.click(screen.getByLabelText(/SA001 · pH/))
    expect(screen.getByText(/ensayo marcado como no emitible/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agregar normativa' }))
    await user.type(screen.getByLabelText('Norma'), 'Resolución acordada')
    await user.type(screen.getByLabelText('Artículo'), '5')
    await user.selectOptions(screen.getByLabelText('Tipo de descarga'), 'ARD')
    await user.type(screen.getByLabelText('Regla de decisión (texto libre)'), 'Regla acordada')
    await user.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    await waitFor(() => expect(mocks.saveQuote).toHaveBeenCalledWith(null, expect.objectContaining({
      client_id: client.id,
      tests: [expect.objectContaining({ test_id: 'test-1' })],
      regulations: [expect.objectContaining({
        regulation_name: 'Resolución acordada',
        article: '5',
        discharge_type: 'ARD',
        decision_rule: null,
        requires_confirmation: true,
      })],
    })))
  })

  it('permite cambiar el estado de una cotización', async () => {
    const user = userEvent.setup()
    mocks.listQuotes.mockResolvedValue([quote])
    render(<QuotesPage />)
    await screen.findByText(quote.code)
    await user.selectOptions(screen.getByRole('combobox', { name: `Estado de ${quote.code}` }), 'ACTIVE')

    await waitFor(() => expect(mocks.setQuoteStatus).toHaveBeenCalledWith(quote.id, 'ACTIVE'))
  })
})
