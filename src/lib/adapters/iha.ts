/**
 * Adaptador IHA — STUB.
 * A01: extracción automática pendiente.
 */
import { registerAdapter } from '../pdfAdapter'
import type { LabPdfAdapter, PdfExtractResult } from '../pdfAdapter'

const IhaAdapter: LabPdfAdapter = {
  id: 'IHA',
  laboratoryName: 'IHA',
  formatVersion: 'pendiente',

  canHandle(textContent: string): boolean {
    return /\bIHA\b/.test(textContent)
  },

  extract(textContent: string): PdfExtractResult {
    void textContent
    return {
      rows: [],
      requiresManualCapture: true,
      warnings: [
        'Adaptador IHA: extracción automática pendiente de implementación. ' +
        'Use pegado o digitación manual con el PDF visible.',
      ],
    }
  },
}

registerAdapter(IhaAdapter)
export { IhaAdapter }
