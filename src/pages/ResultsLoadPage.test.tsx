import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultsLoadPage } from './ResultsLoadPage'

const mocks = vi.hoisted(() => ({
  roles: [{ code: 'ANALISTA', name: 'Analista' }],
  confirmImportRow: vi.fn(),
  correctResult: vi.fn(),
  findDuplicateImport: vi.fn(),
  getResultLoadOptions: vi.fn(),
  listImportRows: vi.fn(),
  listResultCorrections: vi.fn(),
  listResults: vi.fn(),
  saveResultImport: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ roles: mocks.roles }),
}))

vi.mock('../services/results', () => ({
  confirmImportRow: mocks.confirmImportRow,
  correctResult: mocks.correctResult,
  findDuplicateImport: mocks.findDuplicateImport,
  getResultLoadOptions: mocks.getResultLoadOptions,
  listImportRows: mocks.listImportRows,
  listResultCorrections: mocks.listResultCorrections,
  listResults: mocks.listResults,
  saveResultImport: mocks.saveResultImport,
}))

vi.mock('../services/storage', () => ({
  createStorageSignedUrl: vi.fn().mockResolvedValue('https://signed.example/report.pdf'),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: mocks.storageUpload,
        remove: mocks.storageRemove,
      }),
    },
  },
}))

const loadOptions = {
  samples: [{ id: 'sample-1', code: 'AG0101', client_name: 'Cliente de prueba' }],
  laboratories: [{ id: 'lab-1', code: 'LAB-01', name: 'Laboratorio de prueba' }],
  tests: [{ id: 'test-1', code: 'SA-001', parameter_name: 'Plomo' }],
  aliases: [],
}

const storedRow = {
  id: 'row-1',
  result_import_id: 'import-1',
  row_number: 1,
  external_parameter: 'Parámetro sin alias',
  external_unit: 'mg/L',
  external_result: '  < 0,040  ',
  mapped_test_id: null,
  mapping_status: 'UNMAPPED' as const,
  validation_messages: [],
  confirmed: false,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/resultados/carga']}>
      <ResultsLoadPage />
    </MemoryRouter>,
  )
}

describe('carga de resultados', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.roles = [{ code: 'ANALISTA', name: 'Analista' }]
    mocks.getResultLoadOptions.mockResolvedValue(loadOptions)
    mocks.listResults.mockResolvedValue([])
    mocks.listResultCorrections.mockResolvedValue([])
    mocks.listImportRows.mockResolvedValue([storedRow])
    mocks.saveResultImport.mockResolvedValue({ importId: 'import-1', duplicate: false })
    mocks.confirmImportRow.mockResolvedValue('result-1')
    mocks.storageUpload.mockResolvedValue({ error: null })
    mocks.storageRemove.mockResolvedValue({ error: null })
  })

  it('guarda una captura manual sin alias, exige mapear el ensayo y conserva el operador y original', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('option', { name: /AG0101/ })
    await user.selectOptions(screen.getByLabelText('Muestra'), 'sample-1')
    await user.selectOptions(screen.getByLabelText('Laboratorio del informe'), 'lab-1')
    await user.click(screen.getByRole('tab', { name: 'Digitación manual' }))
    await user.type(screen.getByLabelText('Parámetro externo'), 'Parámetro sin alias')
    await user.type(screen.getByLabelText('Resultado original'), '  < 0,040  ')
    await user.click(screen.getByRole('button', { name: 'Guardar captura manual' }))

    await waitFor(() => expect(mocks.saveResultImport).toHaveBeenCalledWith(
      expect.objectContaining({
        sample_id: 'sample-1',
        laboratory_id: 'lab-1',
        source_type: 'MANUAL',
      }),
      [expect.objectContaining({
        external_parameter: 'Parámetro sin alias',
        external_result: '  < 0,040  ',
        mapped_test_id: null,
        mapping_status: 'UNMAPPED',
      })],
    ))

    expect(screen.getByRole('button', { name: 'Confirmar y guardar' })).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Ensayo para fila 1'), 'test-1')
    await user.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))

    await waitFor(() => expect(mocks.confirmImportRow).toHaveBeenCalledWith(
      'row-1',
      'test-1',
      expect.objectContaining({ operator: '<', numeric_value: 0.04 }),
    ))
  })

  it('conserva literalmente el resultado pegado desde Excel y permite seleccionar sus columnas', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('option', { name: /AG0101/ })
    await user.selectOptions(screen.getByLabelText('Muestra'), 'sample-1')
    await user.selectOptions(screen.getByLabelText('Laboratorio del informe'), 'lab-1')
    await user.type(
      screen.getByLabelText(/Pega una grilla tabulada/),
      'Parámetro\tUnidad\tResultado\nParámetro sin alias\tmg/L\t  < 0,040  ',
    )
    await user.click(screen.getByRole('button', { name: 'Leer columnas' }))
    await user.click(screen.getByRole('button', { name: 'Vista previa de filas' }))
    await user.click(screen.getByRole('button', { name: 'Guardar importación pegada' }))

    await waitFor(() => expect(mocks.saveResultImport).toHaveBeenCalledWith(
      expect.objectContaining({ source_type: 'PASTE' }),
      [expect.objectContaining({
        external_result: '  < 0,040  ',
        mapping_status: 'UNMAPPED',
      })],
    ))
    expect(await screen.findByText(
      (_content, element) => element?.tagName === 'CODE' && element.textContent === '  < 0,040  ',
    )).toBeInTheDocument()
  })

  it('reconoce un PDF repetido para la misma muestra y laboratorio sin crear otra importación', async () => {
    const user = userEvent.setup()
    mocks.findDuplicateImport
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'import-1',
        sample_id: 'sample-1',
        laboratory_id: 'lab-1',
        storage_path: 'samples/sample-1/file.pdf',
      })
    vi.stubGlobal('crypto', {
      subtle: { digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)) },
      randomUUID: () => '00000000-0000-4000-8000-000000000001',
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:result-pdf'),
      revokeObjectURL: vi.fn(),
    })
    const pdf = new File(['pdf content'], 'informe.pdf', { type: 'application/pdf' })
    vi.spyOn(pdf, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(10))

    renderPage()
    await screen.findByRole('option', { name: /AG0101/ })
    await user.selectOptions(screen.getByLabelText('Muestra'), 'sample-1')
    await user.selectOptions(screen.getByLabelText('Laboratorio del informe'), 'lab-1')
    await user.click(screen.getByRole('tab', { name: 'Desde PDF' }))
    fireEvent.change(screen.getByLabelText('Seleccionar PDF original'), { target: { files: [pdf] } })
    await screen.findByText(/adaptadores AGQ, Chemilab e IHA son stubs/)
    await user.type(screen.getByLabelText('Parámetro externo'), 'Parámetro sin alias')
    await user.type(screen.getByLabelText('Resultado original'), '7,2')
    await user.click(screen.getByRole('button', { name: 'Guardar PDF y filas' }))

    await waitFor(() => expect(mocks.saveResultImport).toHaveBeenCalledTimes(1))
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)

    const repeatedPdf = new File(['pdf content'], 'informe.pdf', { type: 'application/pdf' })
    vi.spyOn(repeatedPdf, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(10))
    fireEvent.change(screen.getByLabelText('Seleccionar PDF original'), {
      target: { files: [repeatedPdf] },
    })

    expect(await screen.findByText(/Este mismo archivo ya fue cargado/)).toBeInTheDocument()
    expect(mocks.findDuplicateImport).toHaveBeenCalledTimes(2)
    expect(mocks.saveResultImport).toHaveBeenCalledTimes(1)
    expect(mocks.storageUpload).toHaveBeenCalledTimes(1)
  })

  it('no presenta controles de escritura a AUDITOR', async () => {
    mocks.roles = [{ code: 'AUDITOR', name: 'Auditor' }]
    renderPage()

    await screen.findByText('Modo de consulta: solo ANALISTA y ADMIN pueden importar, confirmar o registrar correcciones.')
    expect(screen.queryByRole('tab', { name: 'Digitación manual' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar corrección' })).not.toBeInTheDocument()
  })

  it('registra correcciones solo con motivo y sin sobrescribir el resultado original', async () => {
    const user = userEvent.setup()
    mocks.listResults.mockResolvedValue([{
      id: 'result-1',
      sample_id: 'sample-1',
      test_id: 'test-1',
      laboratory_id: 'lab-1',
      original_text: '< 0,040',
      reported_text: '< 0,040',
      unit: 'mg/L',
      entry_mechanism: 'MANUAL',
      status: 'CONFIRMED',
      entered_by: 'user-1',
      created_at: '2026-10-19T10:00:00Z',
    }])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Registrar corrección' }))
    await user.clear(screen.getByLabelText('Texto corregido (tal como debe registrarse)'))
    await user.type(screen.getByLabelText('Texto corregido (tal como debe registrarse)'), '< 0,050')
    const submit = screen.getByRole('button', { name: 'Registrar corrección sin sobrescribir el original' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Motivo de la corrección'), 'Transcripción confirmada con el laboratorio')
    await user.click(submit)
    await waitFor(() => expect(mocks.correctResult).toHaveBeenCalledWith(
      'result-1',
      { reported_text: '< 0,050' },
      'Transcripción confirmada con el laboratorio',
    ))
    expect(mocks.listResults).toHaveBeenCalledWith('sample-1')
  })
})
