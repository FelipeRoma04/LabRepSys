/**
 * Interfaz pública para adaptadores de extracción de PDF de laboratorio.
 * A01 — Req: canHandle, extract, degradar a captura manual si no hay texto.
 *
 * Adaptadores implementados: AGQ, Chemilab e IHA (ver docs/ADAPTADORES_PDF.md).
 * Si ningún adaptador reconoce el PDF, el flujo degrada a captura manual con el PDF visible.
 * Sin OCR (DP-023): si el PDF no tiene texto, se ofrece captura manual.
 */

/** Una fila candidata extraída de un PDF */
export interface PdfExtractedRow {
  /** Parámetro tal como aparece en el PDF (texto original) */
  externalParameter: string
  /** Unidad tal como aparece */
  externalUnit?: string
  /** Resultado tal como aparece — NUNCA interpretado */
  externalResult: string
  /** Incertidumbre tal como aparece */
  uncertaintyText?: string
  /** LCM tal como aparece */
  lcmText?: string
  /** Método tal como aparece */
  methodText?: string
  /** Técnica tal como aparece */
  techniqueText?: string
  /** Marca del laboratorio junto al parámetro ("*", "*A", "(A) (*)"), sin interpretar */
  marker?: string
  /** Sección o grupo de la tabla (p. ej. "HAPs", "Metales") */
  section?: string
  /** Fecha inicio análisis, ISO YYYY-MM-DD (convertida desde el formato del laboratorio) */
  analysisStart?: string
  /** Fecha fin análisis, ISO YYYY-MM-DD */
  analysisEnd?: string
  /** Página de origen en el PDF */
  sourcePage?: number
  /** Observaciones o desviaciones del laboratorio que aplican a esta fila */
  observations?: string[]
  /** Línea de datos original, para diagnóstico */
  rawLine?: string
}

/** Resultado de la extracción */
export interface PdfExtractResult {
  /** Filas candidatas — todas con mapping_status SUGGESTED o UNMAPPED */
  rows: PdfExtractedRow[]
  /**
   * true si el PDF no tiene capa de texto o el formato no coincide.
   * En ese caso rows puede estar vacío y se debe degradar a captura manual.
   */
  requiresManualCapture: boolean
  /** Líneas no reconocidas para diagnóstico */
  unrecognizedLines?: string[]
  /** Versión del formato detectada */
  detectedFormatVersion?: string
  /** Advertencias no críticas */
  warnings?: string[]
  /**
   * Datos del documento para cotejar con la muestra (fechas, tipo, referencia).
   * NUNCA incluye datos de contacto del cliente (nombre, NIT, dirección, correo, teléfono).
   */
  documentInfo?: Record<string, string>
  /** Observaciones del documento que no se pueden ligar a una fila */
  documentObservations?: string[]
}

/**
 * Contrato de adaptador de PDF de laboratorio.
 * Implementar canHandle y extract.
 */
export interface LabPdfAdapter {
  /** Identificador único del adaptador */
  id: string
  /** Nombre legible del laboratorio */
  laboratoryName: string
  /** Versión del formato de PDF soportada */
  formatVersion: string

  /**
   * Detecta si este adaptador puede procesar el PDF dado.
   * La detección se basa en el CONTENIDO (texto extraído), no en el nombre del archivo.
   *
   * @param textContent - texto completo extraído del PDF con pdfjs-dist
   * @returns true si el adaptador reconoce este formato
   */
  canHandle(textContent: string): boolean

  /**
   * Extrae filas candidatas del PDF.
   * Si el PDF no tiene texto, retorna requiresManualCapture: true.
   * Si el formato no coincide exactamente, retorna filas parciales + unrecognizedLines.
   * NUNCA interpreta, convierte, redondea ni normaliza. Solo extrae texto.
   */
  extract(textContent: string): PdfExtractResult
}

/** Registro global de adaptadores */
const adapterRegistry: LabPdfAdapter[] = []

export function registerAdapter(adapter: LabPdfAdapter): void {
  const existing = adapterRegistry.findIndex((a) => a.id === adapter.id)
  if (existing >= 0) adapterRegistry[existing] = adapter
  else adapterRegistry.push(adapter)
}

export function findAdapter(textContent: string): LabPdfAdapter | null {
  return adapterRegistry.find((a) => a.canHandle(textContent)) ?? null
}

export function getAllAdapters(): readonly LabPdfAdapter[] {
  return adapterRegistry
}

/** Resultado de buscar adaptador y extraer */
export interface AdapterExtraction {
  adapter: LabPdfAdapter | null
  result: PdfExtractResult
}

/**
 * Busca el adaptador por contenido y extrae. Nunca lanza: cualquier error
 * degrada a captura manual con una advertencia.
 */
export function extractWithAdapter(textContent: string): AdapterExtraction {
  if (textContent.replace(/\s/g, '').length < 20) {
    return {
      adapter: null,
      result: {
        rows: [],
        requiresManualCapture: true,
        warnings: ['El PDF no tiene capa de texto (posiblemente escaneado). Sin OCR: capture manualmente con el PDF visible.'],
      },
    }
  }
  const adapter = findAdapter(textContent)
  if (!adapter) {
    return {
      adapter: null,
      result: {
        rows: [],
        requiresManualCapture: true,
        warnings: ['Ningún adaptador reconoce el formato de este PDF. Capture manualmente con el PDF visible.'],
      },
    }
  }
  try {
    return { adapter, result: adapter.extract(textContent) }
  } catch (cause) {
    return {
      adapter,
      result: {
        rows: [],
        requiresManualCapture: true,
        warnings: [`El adaptador ${adapter.laboratoryName} falló al leer el PDF (${cause instanceof Error ? cause.message : 'error desconocido'}). Capture manualmente.`],
      },
    }
  }
}
