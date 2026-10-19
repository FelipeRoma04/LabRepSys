import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

function type(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } })
}
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogPage } from './CatalogPage'
import { catalogDefinitions, type CatalogTable } from '../types/catalogs'

const mocks = vi.hoisted(() => ({
  roles: [{ code: 'ADMIN', name: 'Administrador' }],
  createCatalogRecord: vi.fn(),
  createTestVersion: vi.fn(),
  importTestsCsv: vi.fn(),
  listCatalogRecords: vi.fn(),
  listReferenceRecords: vi.fn(),
  listTestIssuability: vi.fn(),
  setCatalogRecordActive: vi.fn(),
  updateCatalogRecord: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: mocks.roles }),
}))

vi.mock('../services/catalogs', () => ({
  createCatalogRecord: mocks.createCatalogRecord,
  createTestVersion: mocks.createTestVersion,
  importTestsCsv: mocks.importTestsCsv,
  listCatalogRecords: mocks.listCatalogRecords,
  listReferenceRecords: mocks.listReferenceRecords,
  listTestIssuability: mocks.listTestIssuability,
  setCatalogRecordActive: mocks.setCatalogRecordActive,
  updateCatalogRecord: mocks.updateCatalogRecord,
}))

describe('Catálogos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.roles = [{ code: 'ADMIN', name: 'Administrador' }]
    mocks.listCatalogRecords.mockResolvedValue([])
    mocks.listReferenceRecords.mockResolvedValue([])
    mocks.listTestIssuability.mockResolvedValue([])
    mocks.createCatalogRecord.mockResolvedValue(undefined)
    mocks.createTestVersion.mockResolvedValue(undefined)
    mocks.updateCatalogRecord.mockResolvedValue(undefined)
    mocks.setCatalogRecordActive.mockResolvedValue(undefined)
  })

  it('crea un registro y vuelve a consultar los datos persistidos', async () => {
    const user = userEvent.setup()
    mocks.listCatalogRecords
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'matrix-1', code: 'AGUA', name: 'Agua', active: true }])

    render(<CatalogPage table="matrices" />)
    await user.click(await screen.findByRole('button', { name: 'Crear registro' }))
    type(screen.getByLabelText(/Código/), 'AGUA')
    type(screen.getByLabelText(/Nombre/), 'Agua')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      expect(mocks.createCatalogRecord).toHaveBeenCalledWith('matrices', {
        code: 'AGUA',
        name: 'Agua',
        description: null,
      })
    })
    expect(await screen.findByText('AGUA')).toBeInTheDocument()
    expect(mocks.listCatalogRecords).toHaveBeenCalledTimes(2)
  })

  it('permite cambios técnicos de ensayos solo como una nueva versión', async () => {
    const user = userEvent.setup()
    mocks.listCatalogRecords.mockResolvedValue([{
      id: 'test-1',
      code: 'SA-001',
      parameter_name: 'Plomo',
      default_unit: 'mg/L',
      lcm: 0.04,
      uncertainty_text: null,
      accreditation_type: 'NOT_ACCREDITED',
      matrix_id: null,
      method_id: null,
      technique: null,
      laboratory_id: null,
      observations: null,
      version: 1,
      valid_from: '2020-01-01',
      valid_until: null,
      active: true,
    }])
    mocks.listTestIssuability.mockResolvedValue([{
      id: 'test-1',
      issuable: false,
      missing_fields: ['Método'],
      execution_class: 'SA_NO_ACREDITADO',
    }])

    render(<CatalogPage table="tests" />)
    await user.click(await screen.findByRole('button', { name: 'Nueva versión' }))
    type(screen.getByLabelText('Unidad'), 'µg/L')
    fireEvent.change(screen.getByLabelText(/Vigente desde/), {
      target: { value: '2026-10-17' },
    })
    await user.click(screen.getByRole('button', { name: 'Crear versión' }))

    await waitFor(() => {
      expect(mocks.createTestVersion).toHaveBeenCalledWith('test-1', expect.objectContaining({
        default_unit: 'µg/L',
        valid_from: '2026-10-17',
      }))
    })
    expect(mocks.updateCatalogRecord).not.toHaveBeenCalled()
    expect(screen.getByText(/No emitible/)).toBeInTheDocument()
  })

  it('oculta los controles de escritura para usuarios que no son ADMIN', async () => {
    mocks.roles = [{ code: 'ANALISTA', name: 'Analista' }]
    render(<CatalogPage table="matrices" />)

    expect(await screen.findByText('No hay registros')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear registro' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('crea plantillas como borrador y abre el editor dedicado', async () => {
    const user = userEvent.setup()
    mocks.listCatalogRecords.mockResolvedValue([{
      id: 'template-1',
      code: 'RSA',
      version: 1,
      status: 'DRAFT',
      configuration: {},
      active: true,
    }])
    render(
      <MemoryRouter>
        <CatalogPage table="report_templates" />
      </MemoryRouter>,
    )

    const editLink = await screen.findByRole('link', { name: 'Abrir editor' })
    expect(editLink).toHaveAttribute('href', '/catalogos/plantillas/template-1/editar')

    await user.click(screen.getByRole('button', { name: 'Crear registro' }))
    type(screen.getByLabelText(/Código/), 'RSA')
    type(screen.getByLabelText(/Versión/), '1')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      expect(mocks.createCatalogRecord).toHaveBeenCalledWith(
        'report_templates',
        { code: 'RSA', version: 1, configuration: {} },
      )
    })
  })

  it.each(Object.keys(catalogDefinitions) as CatalogTable[])(
    'permite crear un registro del catálogo %s',
    async (table) => {
      const user = userEvent.setup()
      mocks.listReferenceRecords.mockImplementation(async (referenceTable: CatalogTable) => [{
        id: `${referenceTable}-1`,
        code: 'REF-1',
        name: 'Referencia de prueba',
        resolution: 'Resolución de prueba',
        active: true,
      }])
      render(<CatalogPage table={table} />)
      await user.click(await screen.findByRole('button', { name: 'Crear registro' }))
      const dialog = screen.getByRole('dialog')

      for (const field of catalogDefinitions[table].fields) {
        const control = within(dialog).queryByLabelText(field.label, { exact: false })
        if (!control) continue
        if (field.type === 'select') {
          if (field.reference) {
            await waitFor(() => {
              expect(control.querySelectorAll('option').length).toBeGreaterThan(1)
            })
          }
          const value = field.options?.[0]?.value ??
            (field.reference ? `${field.reference.table}-1` : '')
          if (value) await user.selectOptions(control, value)
        } else if (field.type === 'json') {
          fireEvent.change(control, { target: { value: '{}' } })
        } else {
          const value =
            field.key === 'code'
              ? table === 'tests' ? 'SA-TEST-1' : 'TEST-1'
              : field.type === 'number'
                ? '1'
                : field.type === 'date'
                  ? '2026-10-17'
                  : field.key === 'external_code'
                    ? 'AGQ'
                    : field.type === 'email'
                      ? 'qa@example.test'
                    : 'Dato de prueba'
          fireEvent.change(control, { target: { value } })
        }
      }

      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
      await waitFor(() => {
        expect(mocks.createCatalogRecord).toHaveBeenCalledWith(
          table,
          expect.any(Object),
        )
      })
    },
  )
})
