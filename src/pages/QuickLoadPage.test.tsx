import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfReading } from '../features/quickload/quickLoadService'
import type { ResultLoadOptions } from '../types/results'
import { QuickLoadPage } from './QuickLoadPage'

const mocks = vi.hoisted(() => ({
  getResultLoadOptions: vi.fn(),
  listApprovedTemplates: vi.fn(),
  readPdf: vi.fn(),
  isDuplicatePdf: vi.fn(),
  generateDraft: vi.fn(),
  learnTestAlias: vi.fn(),
}))

vi.mock('../services/results', () => ({ getResultLoadOptions: mocks.getResultLoadOptions }))
vi.mock('../features/quickload/quickLoadService', () => ({
  listApprovedTemplates: mocks.listApprovedTemplates,
  readPdf: mocks.readPdf,
  isDuplicatePdf: mocks.isDuplicatePdf,
  generateDraft: mocks.generateDraft,
  learnTestAlias: mocks.learnTestAlias,
}))

const options: ResultLoadOptions = {
  samples: [{ id: 's-1', code: 'AG0346', client_name: 'Cliente DEMO', client_id: 'c-1' }],
  laboratories: [
    { id: 'lab-agq', code: 'SA2', name: 'AGQ' },
    { id: 'lab-iha', code: 'SA3', name: 'IHA' },
  ],
  tests: [
    { id: 'test-ph', code: 'SA-PH', parameter_name: 'pH' },
    { id: 'test-na', code: 'SA-NA', parameter_name: 'Sodio' },
  ],
  aliases: [{ test_id: 'test-ph', laboratory_id: 'lab-agq', external_name: 'pH' }],
}

function reading(adapterId: string | null, rows: PdfReading['result']['rows']): PdfReading {
  return {
    hash: `hash-${adapterId}`,
    adapterId,
    adapterName: adapterId === 'AGQ' ? 'AGQ Colombia' : adapterId,
    formatVersion: '1',
    result: { rows, requiresManualCapture: rows.length === 0 },
  }
}

const row = (externalParameter: string, externalResult = '7,1') => ({
  externalParameter,
  externalResult,
  analysisStart: '2026-11-01',
  analysisEnd: '2026-11-02',
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/resultados/rapida']}>
      <Routes>
        <Route path="/resultados/rapida" element={<QuickLoadPage />} />
        <Route path="/reportes/:id" element={<h1>Detalle del borrador</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getResultLoadOptions.mockResolvedValue(options)
  mocks.listApprovedTemplates.mockResolvedValue([{ id: 'tpl-1', code: 'RSA', version: 1 }])
  mocks.isDuplicatePdf.mockResolvedValue(false)
  mocks.generateDraft.mockResolvedValue({ reportId: 'rep-1', resultIds: ['r1', 'r2'], importIds: ['i1'] })
})

describe('Carga rápida', () => {
  it('detecta el laboratorio, muestra solo lo dudoso y genera el borrador', async () => {
    const user = userEvent.setup()
    mocks.readPdf.mockResolvedValue(reading('AGQ', [row('pH'), row('Sodio')]))
    renderPage()

    await user.selectOptions(await screen.findByLabelText('Muestra'), 's-1')
    await user.upload(screen.getByLabelText('Elegir PDF'), new File(['%PDF'], 'agq.pdf', { type: 'application/pdf' }))

    expect(await screen.findByText('Formato AGQ Colombia')).toBeInTheDocument()
    expect(screen.getByLabelText('Laboratorio de agq.pdf')).toHaveValue('lab-agq')
    expect(screen.getByText('Filas dudosas (1)')).toBeInTheDocument()
    expect(screen.getByText('Sin alias para este laboratorio')).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'pH' })).not.toBeInTheDocument()

    const generate = screen.getByRole('button', { name: 'Generar borrador' })
    expect(generate).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Ensayo para Sodio'), 'test-na')
    expect(generate).toBeEnabled()
    await user.click(generate)

    expect(await screen.findByRole('heading', { name: 'Detalle del borrador' })).toBeInTheDocument()
    const call = mocks.generateDraft.mock.calls[0][0]
    expect(call).toMatchObject({ sampleId: 's-1', clientId: 'c-1', templateId: 'tpl-1' })
    expect(call.files[0].laboratoryId).toBe('lab-agq')
    expect(call.files[0].rows.map((item: { mappedTestId: string }) => item.mappedTestId)).toEqual(['test-ph', 'test-na'])
  })

  it('pide elegir el laboratorio cuando el formato no se reconoce', async () => {
    const user = userEvent.setup()
    mocks.readPdf.mockResolvedValue(reading(null, [row('pH')]))
    renderPage()

    await user.selectOptions(await screen.findByLabelText('Muestra'), 's-1')
    await user.upload(screen.getByLabelText('Elegir PDF'), new File(['%PDF'], 'raro.pdf', { type: 'application/pdf' }))

    expect(await screen.findByText('Formato no reconocido')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Laboratorio de raro.pdf'), 'lab-agq')
    await waitFor(() => expect(screen.getByText('Filas dudosas (0)')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Generar borrador' })).toBeEnabled()
  })

  it('no vuelve a cargar un PDF que ya existe para la muestra', async () => {
    const user = userEvent.setup()
    mocks.readPdf.mockResolvedValue(reading('AGQ', [row('pH')]))
    mocks.isDuplicatePdf.mockResolvedValue(true)
    renderPage()

    await user.selectOptions(await screen.findByLabelText('Muestra'), 's-1')
    await user.upload(screen.getByLabelText('Elegir PDF'), new File(['%PDF'], 'agq.pdf', { type: 'application/pdf' }))

    expect(await screen.findByText('Ya cargado para esta muestra')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generar borrador' })).toBeDisabled()
  })

  it('guarda el alias elegido a mano para la próxima carga', async () => {
    const user = userEvent.setup()
    mocks.readPdf.mockResolvedValue(reading('AGQ', [row('Sodio'), row('Sodio', '9,9')]))
    mocks.learnTestAlias.mockResolvedValue({ ok: true, created: true })
    renderPage()

    await user.selectOptions(await screen.findByLabelText('Muestra'), 's-1')
    await user.upload(screen.getByLabelText('Elegir PDF'), new File(['%PDF'], 'agq.pdf', { type: 'application/pdf' }))
    expect(await screen.findByText('Filas dudosas (2)')).toBeInTheDocument()

    const [first] = screen.getAllByLabelText('Ensayo para Sodio')
    await user.selectOptions(first, 'test-na')
    await user.click(screen.getByRole('button', { name: 'Recordar para la próxima vez' }))

    expect(mocks.learnTestAlias).toHaveBeenCalledWith({ testId: 'test-na', laboratoryId: 'lab-agq', externalName: 'Sodio' })
    expect(await screen.findByText('«Sodio» quedó guardado como alias para la próxima carga.')).toBeInTheDocument()
    expect(screen.getByText('Filas dudosas (0)')).toBeInTheDocument()
  })

  it('en un informe de Chemilab con varias muestras pide la columna y la propone por código', async () => {
    const user = userEvent.setup()
    mocks.readPdf.mockResolvedValue({
      ...reading('CHEMILAB', []),
      result: {
        rows: [],
        requiresManualCapture: false,
        sampleColumns: [
          { label: 'Salida 1 AG0346', rows: [row('pH', '7,0')] },
          { label: 'Salida 2 AG0347', rows: [row('pH', '8,0'), row('Sodio', '3')] },
        ],
      },
    })
    renderPage()

    await user.selectOptions(await screen.findByLabelText('Muestra'), 's-1')
    await user.upload(screen.getByLabelText('Elegir PDF'), new File(['%PDF'], 'chemilab.pdf', { type: 'application/pdf' }))

    const column = await screen.findByLabelText('Columna de muestra en chemilab.pdf')
    expect(column).toHaveValue('0')
    await user.selectOptions(screen.getByLabelText('Laboratorio de chemilab.pdf'), 'lab-agq')
    await user.selectOptions(column, '1')
    expect(await screen.findByText('2 fila(s), 1 dudosa(s)', { exact: false })).toBeInTheDocument()
  })
})
