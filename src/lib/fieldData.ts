import type { AttachmentType } from '../types/fieldData'

export type CoordinateResult =
  | { state: 'NORMALIZED'; value: number }
  | { state: 'AMBIGUOUS'; value: null }
  | { state: 'INVALID'; value: null }

const decimalPattern = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/
const dmsPattern =
  /^([+-]?\d{1,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:[.,]\d+)?)\s*["″]?\s*([NSEW])?$/i

export function normalizeCoordinate(
  original: string,
  axis: 'latitude' | 'longitude',
): CoordinateResult {
  const input = original.trim()
  if (!input) return { state: 'AMBIGUOUS', value: null }

  let value: number
  const decimalMatch = decimalPattern.exec(input)
  if (decimalMatch) {
    value = Number(input.replace(',', '.'))
  } else {
    const dmsMatch = dmsPattern.exec(input)
    if (!dmsMatch) return { state: 'AMBIGUOUS', value: null }
    const degreesText = dmsMatch[1]
    const minutes = Number(dmsMatch[2])
    const seconds = Number(dmsMatch[3].replace(',', '.'))
    const hemisphere = dmsMatch[4]?.toUpperCase()
    const degrees = Math.abs(Number(degreesText))
    if (
      !Number.isFinite(degrees) ||
      !Number.isFinite(minutes) ||
      !Number.isFinite(seconds) ||
      minutes >= 60 ||
      seconds >= 60 ||
      (hemisphere && (axis === 'latitude' ? !'NS'.includes(hemisphere) : !'EW'.includes(hemisphere))) ||
      (hemisphere && /^[+-]/.test(degreesText))
    ) {
      return { state: 'INVALID', value: null }
    }
    const negative = hemisphere
      ? hemisphere === 'S' || hemisphere === 'W'
      : degreesText.startsWith('-')
    value = (degrees + minutes / 60 + seconds / 3600) * (negative ? -1 : 1)
  }

  const max = axis === 'latitude' ? 90 : 180
  if (!Number.isFinite(value) || value < -max || value > max) {
    return { state: 'INVALID', value: null }
  }
  return { state: 'NORMALIZED', value }
}

export function normalizeCoordinatePair(
  latitude: string,
  longitude: string,
): {
  latitude: CoordinateResult
  longitude: CoordinateResult
  state: 'NORMALIZED' | 'AMBIGUOUS' | 'INVALID' | 'PENDING'
} {
  if (!latitude.trim() && !longitude.trim()) {
    return {
      latitude: { state: 'AMBIGUOUS', value: null },
      longitude: { state: 'AMBIGUOUS', value: null },
      state: 'PENDING',
    }
  }
  const normalizedLatitude = normalizeCoordinate(latitude, 'latitude')
  const normalizedLongitude = normalizeCoordinate(longitude, 'longitude')
  const state =
    normalizedLatitude.state === 'INVALID' || normalizedLongitude.state === 'INVALID'
      ? 'INVALID'
      : normalizedLatitude.state === 'NORMALIZED' && normalizedLongitude.state === 'NORMALIZED'
        ? 'NORMALIZED'
        : 'AMBIGUOUS'
  return { latitude: normalizedLatitude, longitude: normalizedLongitude, state }
}

const fileTypes: Record<string, { fileType: SampleFileType; mimeTypes: string[] }> = {
  pdf: { fileType: 'pdf', mimeTypes: ['application/pdf'] },
  jpg: { fileType: 'jpg', mimeTypes: ['image/jpeg'] },
  jpeg: { fileType: 'jpg', mimeTypes: ['image/jpeg'] },
  png: { fileType: 'png', mimeTypes: ['image/png'] },
  csv: { fileType: 'csv', mimeTypes: ['text/csv', 'text/plain', 'application/vnd.ms-excel', ''] },
  xlsx: {
    fileType: 'xlsx',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  },
}

export type SampleFileType = 'pdf' | 'jpg' | 'png' | 'csv' | 'xlsx'

export function getSampleFileType(
  fileName: string,
  mimeType: string,
): SampleFileType | null {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (!extension) return null
  const definition = fileTypes[extension]
  if (!definition || !definition.mimeTypes.includes(mimeType.toLowerCase())) return null
  return definition.fileType
}

export function validateSampleAttachment(
  file: Pick<File, 'name' | 'type' | 'size'>,
  maxSizeBytes: number,
  photoEvidenceEnabled: boolean,
  attachmentType: AttachmentType,
): string | null {
  const fileType = getSampleFileType(file.name, file.type)
  if (!fileType) return 'Tipo de archivo no permitido. Usa PDF, JPG, PNG, CSV o XLSX.'
  if (file.size <= 0) return 'El archivo está vacío.'
  if (file.size > maxSizeBytes) {
    return `El archivo supera el máximo configurado de ${formatFileSize(maxSizeBytes)}.`
  }
  if (attachmentType === 'FOTO' && !photoEvidenceEnabled) {
    return 'La carga de fotos como evidencia está deshabilitada por configuración.'
  }
  return null
}

export function sanitizeFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_. -]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120)
  return normalized || 'archivo'
}

export function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`
}

export async function sha256File(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Este navegador no permite calcular la huella SHA-256 del archivo.')
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
