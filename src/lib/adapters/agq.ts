/**
 * Adaptador AGQ — STUB.
 * A01: extracción automática pendiente. No finge interpretar un PDF.
 * Degrada al flujo de captura manual con el PDF visible.
 */
import { registerAdapter } from '../pdfAdapter'
import type { LabPdfAdapter, PdfExtractResult } from '../pdfAdapter'

const AgqAdapter: LabPdfAdapter = {
  id: 'AGQ',
  laboratoryName: 'AGQ Labs',
  formatVersion: 'pendiente',

  canHandle(textContent: string): boolean {
    // Detectar por contenido característico del encabezado AGQ
    return /AGQ\s*(Labs|Laboratories|Análisis)/i.test(textContent)
  },

  extract(textContent: string): PdfExtractResult {
    void textContent
    // STUB: extracción automática no implementada (A01 pendiente)
    return {
      rows: [],
      requiresManualCapture: true,
      warnings: [
        'Adaptador AGQ: extracción automática pendiente de implementación. ' +
        'Use pegado o digitación manual con el PDF visible.',
      ],
    }
  },
}

registerAdapter(AgqAdapter)
export { AgqAdapter }
