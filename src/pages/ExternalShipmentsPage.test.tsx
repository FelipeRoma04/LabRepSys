import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExternalShipmentsPage } from './ExternalShipmentsPage'
import type { ExternalShipmentOptions } from '../types/externalShipments'

const mocks = vi.hoisted(() => ({
  roles: [{ code: 'RECEPCION', name: 'Recepción' }],
  cancelExternalShipment: vi.fn(),
  createExternalShipment: vi.fn(),
  getExternalShipmentOptions: vi.fn(),
  listExternalShipments: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: mocks.roles }),
}))

vi.mock('../services/externalShipments', () => ({
  cancelExternalShipment: mocks.cancelExternalShipment,
  createExternalShipment: mocks.createExternalShipment,
  getExternalShipmentOptions: mocks.getExternalShipmentOptions,
  listExternalShipments: mocks.listExternalShipments,
}))

const options: ExternalShipmentOptions = {
  samples: [{
    id: 'sample-1',
    code: 'AG0101',
    client_id: 'client-1',
    quote_id: null,
    matrix_id: null,
    plan_code: null,
    sampling_point: 'Pozo norte',
    sampled_at: null,
    received_at: '2026-10-19T10:00:00Z',
    status: 'RECEIVED',
    observations: 'Laboratorio externo anotado libremente: no interpretar',
    client: { business_name: 'Cliente de prueba', nit: null },
    tests: [
      {
        id: 'sample-test-1',
        test_id: 'test-1',
        execution_type: 'SUBCONTRACTED',
        assigned_laboratory_id: 'lab-external',
        status: 'PENDING',
        test: { code: 'SA-001', parameter_name: 'Plomo' },
      },
      {
        id: 'sample-test-2',
        test_id: 'test-2',
        execution_type: 'SUBCONTRACTED',
        assigned_laboratory_id: 'lab-external',
        status: 'PENDING',
        test: { code: 'SA-002', parameter_name: 'Mercurio' },
      },
    ],
  }],
  laboratories: [{ id: 'lab-external', code: 'EXT-01', name: 'Laboratorio externo' }],
  attachedSampleTestIds: [],
}

function renderPage(path = '/laboratorios-externos') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ExternalShipmentsPage />
    </MemoryRouter>,
  )
}

describe('envíos a laboratorios externos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.roles = [{ code: 'RECEPCION', name: 'Recepción' }]
    mocks.listExternalShipments.mockResolvedValue([])
    mocks.getExternalShipmentOptions.mockResolvedValue(options)
    mocks.createExternalShipment.mockResolvedValue({
      ok: true,
      shipment_id: 'shipment-1',
      status: 'SENT',
      accreditation_warnings: [{
        sample_test_id: 'sample-test-1',
        test_code: 'SA-001',
        message: 'Verifique el alcance vigente.',
      }],
    })
    mocks.cancelExternalShipment.mockResolvedValue(undefined)
  })

  it('estructura un envío con varios ensayos y muestra advertencias sin bloquear', async () => {
    const user = userEvent.setup()
    renderPage('/laboratorios-externos?sample_id=sample-1')

    await screen.findByText('Laboratorio externo anotado libremente: no interpretar')
    await user.selectOptions(screen.getByLabelText('Laboratorio externo'), 'lab-external')
    await user.click(screen.getByLabelText(/SA-001 · Plomo/))
    await user.click(screen.getByLabelText(/SA-002 · Mercurio/))
    fireEvent.change(screen.getByLabelText(/Fecha esperada/), {
      target: { value: '2026-10-25T10:00' },
    })
    await user.type(screen.getByLabelText('Código externo'), 'EXT-25')
    await user.click(screen.getByRole('button', { name: 'Registrar envío' }))

    await waitFor(() => expect(mocks.createExternalShipment).toHaveBeenCalledWith(expect.objectContaining({
      sample_id: 'sample-1',
      laboratory_id: 'lab-external',
      sample_test_ids: ['sample-test-1', 'sample-test-2'],
      external_code: 'EXT-25',
      expected_at: expect.any(String),
      sent_at: null,
    })))
    expect(await screen.findByText(/Verifique el alcance vigente/)).toBeInTheDocument()
    expect(screen.getByText('El envío se registró. Verifique manualmente estos ensayos; la advertencia no bloquea el proceso.')).toBeInTheDocument()
  })

  it('oculta el formulario de escritura para JTC y AUDITOR', async () => {
    mocks.roles = [{ code: 'AUDITOR', name: 'Auditor' }]
    renderPage()

    await screen.findByText('No hay envíos registrados')
    expect(mocks.getExternalShipmentOptions).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Registrar envío' })).not.toBeInTheDocument()
  })

  it('permite cancelar un envío activo con motivo obligatorio', async () => {
    const user = userEvent.setup()
    mocks.listExternalShipments.mockResolvedValue([{
      id: 'shipment-1',
      sample_id: 'sample-1',
      laboratory_id: 'lab-external',
      external_code: 'EXT-1',
      sent_at: null,
      expected_at: '2026-10-25T10:00:00Z',
      report_received_at: null,
      received_by: null,
      status: 'PENDING_SEND',
      observations: null,
      created_at: '2026-10-19T10:00:00Z',
      laboratory: { name: 'Laboratorio externo' },
      sample: { code: 'AG0101', sampling_point: 'Pozo norte', client: { business_name: 'Cliente de prueba' } },
      tests: [{ sample_test_id: 'sample-test-1', sample_test: { test: { code: 'SA-001' } } }],
    }])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await user.type(screen.getByLabelText('Motivo de cancelación'), 'Reasignación del ensayo')
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))

    await waitFor(() => {
      expect(mocks.cancelExternalShipment).toHaveBeenCalledWith('shipment-1', 'Reasignación del ensayo')
    })
    expect(await screen.findByText('El envío fue cancelado y quedó auditado.')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('SA-001')).toBeInTheDocument()
  })
})
