/**
 * Registro de los adaptadores de PDF de laboratorio.
 * Importar este módulo registra AGQ, Chemilab e IHA (efecto de lado).
 */
import './agq'
import './chemilab'
import './iha'

export { extractWithAdapter, findAdapter, getAllAdapters } from '../pdfAdapter'
export type { AdapterExtraction, LabPdfAdapter, PdfExtractedRow, PdfExtractResult } from '../pdfAdapter'
