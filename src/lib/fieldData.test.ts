import { describe, expect, it, vi } from 'vitest'
import {
  getSampleFileType,
  normalizeCoordinate,
  normalizeCoordinatePair,
  sanitizeFileName,
  sha256File,
  validateSampleAttachment,
} from './fieldData'

describe('validación de datos de campo', () => {
  it('normaliza coordenadas decimales y conserva los textos ambiguos sin normalizar', () => {
    expect(normalizeCoordinatePair('4.7110', '-74,0721')).toEqual({
      latitude: { state: 'NORMALIZED', value: 4.711 },
      longitude: { state: 'NORMALIZED', value: -74.0721 },
      state: 'NORMALIZED',
    })
    expect(normalizeCoordinate('4 42 39', 'latitude')).toEqual({
      state: 'AMBIGUOUS',
      value: null,
    })
  })

  it('normaliza DMS explícitas y rechaza coordenadas fuera de rango', () => {
    expect(normalizeCoordinate(`4°42'39.6"N`, 'latitude')).toEqual({
      state: 'NORMALIZED',
      value: 4 + 42 / 60 + 39.6 / 3600,
    })
    expect(normalizeCoordinate('91.0', 'latitude')).toEqual({
      state: 'INVALID',
      value: null,
    })
  })

  it('valida tipo, tamaño, política de fotos y sanitización del nombre', () => {
    expect(getSampleFileType('solicitud.pdf', 'application/pdf')).toBe('pdf')
    expect(getSampleFileType('script.exe', 'application/octet-stream')).toBeNull()
    expect(validateSampleAttachment(
      new File(['contenido'], 'foto.png', { type: 'image/png' }),
      5,
      false,
      'FOTO',
    )).toContain('supera el máximo')
    expect(validateSampleAttachment(
      new File(['1'], 'foto.png', { type: 'image/png' }),
      10,
      false,
      'FOTO',
    )).toContain('deshabilitada')
    expect(sanitizeFileName('solicitud con ñ.pdf')).toBe('solicitud_con_n.pdf')
  })

  it('calcula y devuelve la huella SHA-256 en hexadecimal', async () => {
    const digest = vi.fn().mockResolvedValue(new Uint8Array([0x0a, 0xff]).buffer)
    vi.stubGlobal('crypto', { subtle: { digest } })
    try {
      expect(await sha256File(new File(['contenido'], 'archivo.pdf'))).toBe('0aff')
      expect(digest).toHaveBeenCalledWith('SHA-256', expect.any(ArrayBuffer))
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
