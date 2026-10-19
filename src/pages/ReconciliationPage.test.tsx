import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReconciliationPage } from './ReconciliationPage'

const mocks = vi.hoisted(() => ({
  roles: [{ code: 'ANALISTA', name: 'Analista' }],
  detectReconciliationIssues: vi.fn(),
  getReconciliationOptions: vi.fn(),
  listIssues: vi.fn(),
  resolveIssue: vi.fn(),
  createStorageSignedUrl: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: mocks.roles }),
}))

vi.mock('../services/results', () => ({
  detectReconciliationIssues: mocks.detectReconciliationIssues,
  getReconciliationOptions: mocks.getReconciliationOptions,
  listIssues: mocks.listIssues,
  resolveIssue: mocks.resolveIssue,
}))

vi.mock('../services/storage', () => ({
  createStorageSignedUrl: mocks.createStorageSignedUrl,
}))

const issues = [
  {
    id: 'issue-1',
    sample_id: 'sample-1',
    issue_type: 'DATE_MISMATCH',
    field_name: 'sampling_date',
    source_a: 'Recepción',
    value_a: '2026-05-29T00:00:00Z',
    source_b: 'Fuente externa',
    value_b: '2026-05-26T00:00:00Z',
    source_c: 'Catálogo',
    value_c: null,
    is_demo: false,
    status: 'OPEN',
    created_at: '2026-10-19T10:00:00Z',
    sample: { code: 'AG0346' },
    decisions: [],
  },
  {
    id: 'issue-demo',
    sample_id: null,
    issue_type: 'DUPLICATE_RESULT',
    field_name: 'result',
    source_a: 'Resultado',
    value_a: '< 0,040',
    source_b: 'Resultado duplicado',
    value_b: '< 0,040',
    source_c: null,
    value_c: null,
    is_demo: true,
    demo_sample_code: 'AG0346',
    status: 'OPEN',
    created_at: '2026-10-19T10:00:00Z',
  },
]

const options = {
  samples: [{ id: 'sample-1', code: 'AG0346' }],
  tests: [{ id: 'test-1', code: 'SA-001', parameter_name: 'Plomo' }],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReconciliationPage />
    </MemoryRouter>,
  )
}

describe('conciliación de inconsistencias', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.roles = [{ code: 'ANALISTA', name: 'Analista' }]
    mocks.listIssues.mockResolvedValue(issues)
    mocks.getReconciliationOptions.mockResolvedValue(options)
    mocks.detectReconciliationIssues.mockResolvedValue(4)
    mocks.resolveIssue.mockResolvedValue('RESOLVED')
    mocks.createStorageSignedUrl.mockResolvedValue('https://signed.example/source.pdf')
  })

  it('mantiene los datos DEMO separados y permite filtrarlos explícitamente', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('cell', { name: 'Fecha distinta' })
    expect(screen.queryByText('Solo demostración')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Incluir datos DEMO'))
    expect(await screen.findByText('Solo demostración')).toBeInTheDocument()
    expect(screen.getByText('DEMO')).toBeInTheDocument()
  })

  it('muestra cada tipo de inconsistencia al incluir el conjunto DEMO', async () => {
    const user = userEvent.setup()
    const demoTypes = [
      ['DATE_MISMATCH', 'Fecha distinta'],
      ['MATRIX_MISMATCH', 'Matriz distinta'],
      ['UNREQUESTED_PARAMETER', 'Parámetro no solicitado'],
      ['MISSING_RESULT', 'Ensayo sin resultado'],
      ['LCM_MISMATCH', 'LCM distinto'],
      ['METHOD_MISMATCH', 'Método distinto'],
      ['UNIT_MISMATCH', 'Unidad distinta'],
      ['TECHNIQUE_MISMATCH', 'Técnica distinta'],
      ['DUPLICATE_RESULT', 'Resultado duplicado'],
      ['LAB_DEVIATION', 'Desviación del laboratorio'],
      ['LEGACY_CODE_NO_MAPPING', 'Código heredado sin mapeo'],
      ['INCOMPLETE_TEST_FIELDS', 'Ensayo con campos incompletos'],
      ['EXTERNAL_REPORT_PENDING', 'Reporte externo pendiente'],
    ] as const
    mocks.listIssues.mockResolvedValue(demoTypes.map(([issue_type], index) => ({
      ...issues[1],
      id: `demo-${index}`,
      issue_type,
    })))
    renderPage()

    await user.click(screen.getByLabelText('Incluir datos DEMO'))
    for (const [, label] of demoTypes) {
      const matchingElements = await screen.findAllByText(label)
      expect(matchingElements.some((element) => element.closest('td'))).toBe(true)
    }
  })

  it('preselecciona la fuente correcta para cerrar un envío externo recibido', async () => {
    const user = userEvent.setup()
    mocks.listIssues.mockResolvedValue([{
      ...issues[0],
      id: 'external-issue',
      issue_type: 'EXTERNAL_REPORT_PENDING',
      source_a: 'Envío externo',
      value_a: 'EXP-001',
      source_b: 'Estado',
      value_b: 'REPORT_RECEIVED',
    }])
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Revisar' }))

    expect(screen.getByLabelText('Acción')).toHaveValue('ACCEPT_B')
    await user.type(screen.getByLabelText('Motivo obligatorio'), 'Se verificó el reporte recibido')
    await user.click(screen.getByRole('button', { name: 'Confirmar decisión' }))

    await waitFor(() => expect(mocks.resolveIssue).toHaveBeenCalledWith(
      'external-issue',
      'ACCEPT_B',
      'Se verificó el reporte recibido',
      'Estado',
      'REPORT_RECEIVED',
      null,
    ))
  })

  it('exige seleccionar un ensayo SA para mapear un código heredado', async () => {
    const user = userEvent.setup()
    mocks.listIssues.mockResolvedValue([{
      ...issues[0],
      id: 'legacy-issue',
      issue_type: 'LEGACY_CODE_NO_MAPPING',
      source_a: 'Código SA',
      value_a: null,
      source_b: 'Fuente externa',
      value_b: 'CHEM AOX',
    }])
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Revisar' }))

    expect(screen.getByLabelText('Acción')).toHaveValue('ACCEPT_B')
    await user.selectOptions(screen.getByLabelText(/Ensayo SA vigente/), 'test-1')
    await user.type(screen.getByLabelText('Motivo obligatorio'), 'Se confirmó el mapeo con el catálogo')
    await user.click(screen.getByRole('button', { name: 'Confirmar decisión' }))

    await waitFor(() => expect(mocks.resolveIssue).toHaveBeenCalledWith(
      'legacy-issue',
      'ACCEPT_B',
      'Se confirmó el mapeo con el catálogo',
      'Fuente externa',
      'CHEM AOX',
      'test-1',
    ))
  })

  it('requiere motivo y envía la aceptación por RPC con usuario, fuente y valor elegidos', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Revisar' }))

    expect(screen.getByText('Recepción', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('Catálogo', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('Fuente externa', { selector: 'strong' })).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'Confirmar decisión' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText('Motivo obligatorio'), 'Se confirma contra el acta de recepción')
    await user.click(confirm)

    await waitFor(() => expect(mocks.resolveIssue).toHaveBeenCalledWith(
      'issue-1',
      'ACCEPT_A',
      'Se confirma contra el acta de recepción',
      'Recepción',
      '2026-05-29T00:00:00Z',
      null,
    ))
  })

  it('permite a JEFE_TECNICA_CALIDAD devolver para revisión sin resolver el issue', async () => {
    const user = userEvent.setup()
    mocks.roles = [{ code: 'JEFE_TECNICA_CALIDAD', name: 'Jefe de técnica y calidad' }]
    mocks.resolveIssue.mockResolvedValue('OPEN')
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Revisar' }))
    expect(screen.getByLabelText('Acción')).toHaveValue('REQUEST_REVIEW')
    expect(screen.queryByRole('option', { name: /Aceptar recepción/ })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Motivo obligatorio'), 'Revisar con el laboratorio')
    await user.click(screen.getByRole('button', { name: 'Registrar solicitud de revisión' }))

    await waitFor(() => expect(mocks.resolveIssue).toHaveBeenCalledWith(
      'issue-1',
      'REQUEST_REVIEW',
      'Revisar con el laboratorio',
      null,
      null,
      null,
    ))
  })

  it('restringe a AUDITOR a lectura y permite filtrar por muestra y clase', async () => {
    const user = userEvent.setup()
    mocks.roles = [{ code: 'AUDITOR', name: 'Auditor' }]
    renderPage()
    await screen.findByRole('cell', { name: 'Fecha distinta' })

    expect(screen.queryByRole('button', { name: 'Detectar inconsistencias' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revisar' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Muestra'), 'sample-1')
    await user.selectOptions(screen.getByLabelText('Tipo de inconsistencia'), 'DATE_MISMATCH')
    expect(screen.getByRole('cell', { name: 'Fecha distinta' })).toBeInTheDocument()
    expect(screen.queryByText('Solo demostración')).not.toBeInTheDocument()
  })

  it('ejecuta detección idempotente para una muestra sin modificar datos en el cliente', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('cell', { name: 'Fecha distinta' })
    await user.selectOptions(screen.getByLabelText('Muestra'), 'sample-1')
    await user.click(screen.getByRole('button', { name: 'Detectar inconsistencias' }))

    await waitFor(() => expect(mocks.detectReconciliationIssues).toHaveBeenCalledWith('sample-1'))
    expect(await screen.findByText(/no se modificó ningún dato automáticamente/)).toBeInTheDocument()
  })
})
