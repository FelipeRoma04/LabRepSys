/**
 * Adaptador Chemilab — STUB.
 * A01: extracción automática pendiente.
 */
import { registerAdapter } from '../pdfAdapter'
import type { LabPdfAdapter, PdfExtractResult } from '../pdfAdapter'

const ChemilabAdapter: LabPdfAdapter = {
  id: 'CHEMILAB',
  laboratoryName: 'Chemilab',
  formatVersion: 'pendiente',

  canHandle(textContent: string): boolean {
    return /Chemilab/i.test(textContent)
  },

  extract(textContent: string): PdfExtractResult {
    void textContent
    return {
      rows: [],
      requiresManualCapture: true,
      warnings: [
        'Adaptador Chemilab: extracción automática pendiente de implementación. ' +
        'Use pegado o digitación manual con el PDF visible.',
      ],
    }
  },
}

registerAdapter(ChemilabAdapter)
export { ChemilabAdapter }
