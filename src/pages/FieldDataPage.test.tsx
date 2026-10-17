import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FieldDataPage } from './FieldDataPage'

const mocks = vi.hoisted(() => ({
  roles: [{ code: 'MUESTREO', name: 'Muestreo' }],
  listSamples: vi.fn(),
  listFieldParameters: vi.fn(),
  getSampleAttachmentSettings: vi.fn(),
  getSampleFieldData: vi.fn(),
  listSampleAttachments: vi.fn(),
  saveSampleFieldData: vi.fn(),
  uploadSampleAttachment: vi.fn(),
  retireSampleAttachment: vi.fn(),
  getSampleAttachmentSignedUrl: vi.fn(),
  setPhotoEvidenceEnabled: vi.fn(),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    profile: { id: 'user-1', fullName: 'Muestreador', email: 'muestra@example.test' },
    roles: mocks.roles,
  }),
}))

vi.mock('../services/samples', () => ({
  listSamples: mocks.listSamples,
}))

vi.mock('../services/fieldData', () => ({
  listFieldParameters: mocks.listFieldParameters,
  getSampleAttachmentSettings: mocks.getSampleAttachmentSettings,
  getSampleFieldData: mocks.getSampleFieldData,
  listSampleAttachments: mocks.listSampleAttachments,
  saveSampleFieldData: mocks.saveSampleFieldData,
  uploadSampleAttachment: mocks.uploadSampleAttachment,
  retireSampleAttachment: mocks.retireSampleAttachment,
  getSampleAttachmentSignedUrl: mocks.getSampleAttachmentSignedUrl,
  setPhotoEvidenceEnabled: mocks.setPhotoEvidenceEnabled,
}))

const sample = {
  id: 'sample-1',
  code: 'AG0346',
  client_id: 'client-1',
  quote_id: null,
  matrix_id: null,
  plan_code: null,
  sampling_point: null,
  sampled_at: null,
  received_at: '2026-10-16T11:00:00Z',
  status: 'PENDING_REVIEW',
  observations: null,
  client: { business_name: 'Cliente de prueba', nit: null },
}
const parameters = [
  { id: 'pH-id', code: 'ph', name: 'pH', default_unit: 'Unidades pH', active: true },
  { id: 'conductivity-id', code: 'conductivity', name: 'Conductividad', default_unit: 'µS/cm', active: true },
]

function renderPage(path = '/muestras/datos-de-campo') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/muestras/datos-de-campo" element={<FieldDataPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.roles = [{ code: 'MUESTREO', name: 'Muestreo' }]
  mocks.listSamples.mockResolvedValue([sample])
  mocks.listFieldParameters.mockResolvedValue(parameters)
  mocks.getSampleAttachmentSettings.mockResolvedValue({
    maxSizeBytes: 10 * 1024 * 1024,
    photoEvidenceEnabled: false,
  })
  mocks.getSampleFieldData.mockResolvedValue(null)
  mocks.listSampleAttachments.mockResolvedValue([])
  mocks.saveSampleFieldData.mockResolvedValue(undefined)
  mocks.uploadSampleAttachment.mockResolvedValue(undefined)
  mocks.retireSampleAttachment.mockResolvedValue(undefined)
  mocks.getSampleAttachmentSignedUrl.mockResolvedValue('https://signed.example.test/file')
  mocks.setPhotoEvidenceEnabled.mockResolvedValue(undefined)
})

describe('datos de campo y adjuntos', () => {
  it('guarda cero como VALUE y separa NOT_REPORTED de un valor numérico', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByLabelText('Latitud original')
    await user.selectOptions(screen.getByLabelText('Estado de pH'), 'VALUE')
    await user.type(screen.getByLabelText('Valor de pH'), '0')
    await user.selectOptions(screen.getByLabelText('Estado de Conductividad'), 'NOT_REPORTED')
    await user.click(screen.getByRole('button', { name: 'Guardar datos de campo' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Los datos de campo se guardaron correctamente.')
    expect(mocks.saveSampleFieldData).toHaveBeenCalledWith(
      'sample-1',
      expect.objectContaining({ coordinate_state: 'PENDING', collected_by: 'user-1' }),
      [
        expect.objectContaining({ field_parameter_id: 'pH-id', value_state: 'VALUE', numeric_value: 0 }),
        expect.objectContaining({ field_parameter_id: 'conductivity-id', value_state: 'NOT_REPORTED', numeric_value: null }),
      ],
      '',
    )
  })

  it('normaliza coordenadas decimales y avisa cuando el formato es ambiguo', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByLabelText('Latitud original')
    await user.type(screen.getByLabelText('Latitud original'), '4.711')
    await user.type(screen.getByLabelText('Longitud original'), '-74.0721')
    expect(await screen.findByText('Coordenadas decimales: 4.711, -74.0721')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Latitud original'))
    await user.type(screen.getByLabelText('Latitud original'), '4 42 39')
    expect(screen.getByRole('status')).toHaveTextContent('No se pudo normalizar el formato de coordenadas.')
  })

  it('rechaza una edición posterior a la recepción si no tiene motivo', async () => {
    const user = userEvent.setup()
    mocks.listSamples.mockResolvedValue([{ ...sample, status: 'RECEIVED' }])
    renderPage()

    await screen.findByLabelText('Latitud original')
    await user.click(screen.getByRole('button', { name: 'Guardar datos de campo' }))
    expect(await screen.findByText('Indica el motivo de edición requerido después de la recepción.')).toBeInTheDocument()
    expect(mocks.saveSampleFieldData).not.toHaveBeenCalled()
  })

  it('valida tipo y tamaño, y carga un adjunto permitido para RECEPCION', async () => {
    const user = userEvent.setup()
    mocks.roles = [{ code: 'RECEPCION', name: 'Recepción' }]
    renderPage()

    const fileInput = await screen.findByLabelText(/Archivo \(PDF/)
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'programa.exe', { type: 'application/octet-stream' })] },
    })
    expect(await screen.findByText('Tipo de archivo no permitido. Usa PDF, JPG, PNG, CSV o XLSX.')).toBeInTheDocument()

    fireEvent.change(fileInput, {
      target: { files: [new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.pdf', { type: 'application/pdf' })] },
    })
    expect(await screen.findByText(/supera el máximo configurado/)).toBeInTheDocument()

    fireEvent.change(fileInput, {
      target: { files: [new File(['pdf'], 'solicitud.pdf', { type: 'application/pdf' })] },
    })
    await user.click(await screen.findByRole('button', { name: 'Cargar adjunto' }))
    expect(await screen.findByRole('status')).toHaveTextContent('El adjunto se cargó correctamente.')
    expect(mocks.uploadSampleAttachment).toHaveBeenCalledWith(
      'sample-1',
      expect.objectContaining({ name: 'solicitud.pdf' }),
      'SOLICITUD',
      10 * 1024 * 1024,
      false,
    )
  })

  it('solo genera una URL firmada por solicitud explícita y no muestra edición a ANALISTA', async () => {
    const user = userEvent.setup()
    mocks.roles = [{ code: 'ANALISTA', name: 'Analista' }]
    mocks.listSampleAttachments.mockResolvedValue([{
      id: 'attachment-1',
      sample_id: 'sample-1',
      attachment_type: 'SOLICITUD',
      storage_path: 'samples/sample-1/file.pdf',
      file_name: 'solicitud.pdf',
      file_type: 'pdf',
      file_size: 3,
      sha256: 'a'.repeat(64),
      uploaded_by: 'user-1',
      withdrawn: false,
      withdrawn_reason: null,
      created_at: '2026-10-16T12:00:00Z',
    }])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Preparar descarga' }))
    expect(await screen.findByRole('link', { name: 'Descargar (enlace válido 60 s)' })).toHaveAttribute(
      'href',
      'https://signed.example.test/file',
    )
    expect(mocks.getSampleAttachmentSignedUrl).toHaveBeenCalledWith('samples/sample-1/file.pdf')
    expect(screen.queryByRole('button', { name: 'Guardar datos de campo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cargar adjunto' })).not.toBeInTheDocument()
  })

  it('mantiene la operación disponible con un viewport mobile de 390 px', async () => {
    const user = userEvent.setup()
    window.innerWidth = 390
    window.dispatchEvent(new Event('resize'))
    renderPage()

    await screen.findByLabelText('Estado de pH')
    await user.selectOptions(screen.getByLabelText('Estado de pH'), 'NOT_REPORTED')
    await waitFor(() => expect(screen.getByLabelText('Estado de pH')).toHaveValue('NOT_REPORTED'))
    expect(window.innerWidth).toBe(390)
  })
})
