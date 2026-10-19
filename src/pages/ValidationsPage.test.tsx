import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidationsPage } from './ValidationsPage'

const mocks = vi.hoisted(() => ({
  roles: [{ code: 'ANALISTA', name: 'Analista' }],
  getValidationHistory: vi.fn(),
  resolveValidationWarning: vi.fn(),
  runValidations: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: mocks.roles }),
}))

vi.mock('../services/validations', () => ({
  getValidationHistory: mocks.getValidationHistory,
  resolveValidationWarning: mocks.resolveValidationWarning,
  runValidations: mocks.runValidations,
}))

const run = {
  id: 'run-1',
  entity_type: 'SAMPLE' as const,
  entity_id: 'sample-uuid',
  status: 'COMPLETED' as const,
  executed_by: 'user-1',
  executed_at: '2026-10-19T12:00:00Z',
}

const warning = {
  id: 'issue-warning',
  validation_run_id: run.id,
  rule_code: 'VAL_DATE_SUSPICIOUS',
  severity: 'WARNING' as const,
  field_name: 'sampled_at',
  message: 'La fecha requiere revisión.',
  blocking: false,
  resolved: false,
  resolution: null,
  resolved_by: null,
  resolved_at: null,
  created_at: run.executed_at,
  rule: { code: 'VAL_DATE_SUSPICIOUS', description: 'Fechas improbables' },
  run,
}

const blocking = {
  ...warning,
  id: 'issue-blocking',
  rule_code: 'VAL_RESULT_UNIT',
  severity: 'ERROR' as const,
  message: 'Falta unidad.',
  blocking: true,
  rule: { code: 'VAL_RESULT_UNIT', description: 'Unidad requerida' },
}

function renderPage() {
  return render(<MemoryRouter><ValidationsPage /></MemoryRouter>)
}

describe('motor de validaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.roles = [{ code: 'ANALISTA', name: 'Analista' }]
    mocks.getValidationHistory.mockResolvedValue({ runs: [run], issues: [warning, blocking] })
    mocks.runValidations.mockResolvedValue('run-2')
    mocks.resolveValidationWarning.mockResolvedValue(undefined)
  })

  it('muestra hallazgos, filtros y evita resolver errores bloqueantes con comentario', async () => {
    renderPage()

    expect(await screen.findByText('La fecha requiere revisión.')).toBeInTheDocument()
    expect(screen.getByText('Falta unidad.')).toBeInTheDocument()
    expect(screen.getByLabelText('Estado')).toHaveValue('open')
    expect(screen.getAllByRole('button', { name: 'Resolver' })).toHaveLength(1)
  })

  it('ejecuta una validación y actualiza el historial', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText('Identificador (UUID)'), 'sample-uuid')
    await user.click(screen.getByRole('button', { name: 'Ejecutar validaciones' }))

    await waitFor(() => expect(mocks.runValidations).toHaveBeenCalledWith('SAMPLE', 'sample-uuid'))
    expect(await screen.findByRole('status')).toHaveTextContent('Validación ejecutada')
  })

  it('resuelve una advertencia con comentario', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText('Comentario para VAL_DATE_SUSPICIOUS'), 'Fecha confirmada con el acta')
    await user.click(screen.getByRole('button', { name: 'Resolver' }))

    await waitFor(() => expect(mocks.resolveValidationWarning).toHaveBeenCalledWith(
      'issue-warning',
      'Fecha confirmada con el acta',
    ))
  })

  it('permite a AUDITOR consultar, pero no ejecutar ni decidir', async () => {
    mocks.roles = [{ code: 'AUDITOR', name: 'Auditor' }]
    renderPage()

    expect(await screen.findByText('Falta unidad.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ejecutar validaciones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resolver' })).not.toBeInTheDocument()
  })
})
