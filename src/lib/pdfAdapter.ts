/**
 * Interfaz pública para adaptadores de extracción de PDF de laboratorio.
 * A01 — Req: canHandle, extract, degradar a captura manual si no hay texto.
 *
 * Los adaptadores AGQ, Chemilab e IHA son STUBS — extracción automática pendiente.
 * El flujo degrada a pegado o digitación manual con el PDF visible.
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
  /** Fecha inicio análisis si existe */
  analysisStart?: string
  /** Fecha fin análisis si existe */
  analysisEnd?: string
  /** Página de origen en el PDF */
  sourcePage?: number
  /** Observaciones o desviaciones del laboratorio */
  observations?: string
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
  adapterRegistry.push(adapter)
}

export function findAdapter(textContent: string): LabPdfAdapter | null {
  return adapterRegistry.find((a) => a.canHandle(textContent)) ?? null
}

export function getAllAdapters(): readonly LabPdfAdapter[] {
  return adapterRegistry
}
