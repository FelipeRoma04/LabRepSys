/**
 * Caso de referencia RSA 0106-2026 (AG0346) con los fixtures ANONIMIZADOS de AGQ,
 * Chemilab e IHA. Copiado de src/lib/report/buildReportModel.test.ts para la comparación visual.
 */
import agqRaw from '../../src/lib/adapters/__fixtures__/agq.txt?raw'
import chemilabRaw from '../../src/lib/adapters/__fixtures__/chemilab.txt?raw'
import ihaRaw from '../../src/lib/adapters/__fixtures__/iha.txt?raw'
import { AgqAdapter } from '../../src/lib/adapters/agq'
import { ChemilabAdapter } from '../../src/lib/adapters/chemilab'
import { IhaAdapter } from '../../src/lib/adapters/iha'
import type { LabPdfAdapter, PdfExtractedRow } from '../../src/lib/pdfAdapter'
import type { ReportLaboratoryInput, ReportModelInput, ReportResultInput } from '../../src/lib/report/types'

const normalize = (text: string) => text.replace(/\r\n/g, '\n')

const LABS: Record<string, ReportLaboratoryInput> = {
  CHEMILAB: { id: 'lab-chemilab', name: 'Chemilab', reportCode: 'SA1', accreditationResolution: 'Resolución No. 1042 del 26 de septiembre del 2024' },
  AGQ: { id: 'lab-agq', name: 'AGQ Colombia', reportCode: 'SA2', accreditationResolution: 'Resolución No. 1080 del 09 de septiembre de 2025' },
  IHA: { id: 'lab-iha', name: 'IHA', reportCode: 'SA3', accreditationResolution: 'Resolución No. 0443 del 20 de abril de 2026' },
}

/** Igual que ResultsLoadPage: notas de fila y fechas timestamptz en hora de Colombia */
function notesOf(row: PdfExtractedRow): string[] {
  return [
    ...(row.sourcePage ? [`Página ${row.sourcePage} del PDF`] : []),
    ...(row.marker ? [`Marca del laboratorio: ${row.marker}`] : []),
    ...(row.section ? [`Sección del informe: ${row.section}`] : []),
    ...(row.observations ?? []),
  ]
}
const timestamp = (date?: string) => (date ? `${date}T00:00:00-05:00` : null)

let order = 0
function confirmedResults(adapter: LabPdfAdapter, raw: string): ReportResultInput[] {
  const lab = LABS[adapter.id]
  return adapter.extract(normalize(raw)).rows.map((row, index) => {
    order += 1
    return {
      id: `${adapter.id}-${index}`,
      sampleId: 'sample-ag0346',
      testId: `${adapter.id}-${index}`,
      parameterName: row.externalParameter,
      laboratory: lab,
      executionType: 'SUBCONTRACTED',
      originalText: row.externalResult,
      unit: row.externalUnit,
      lcmText: row.lcmText,
      uncertaintyText: row.uncertaintyText,
      methodText: row.methodText,
      techniqueText: row.techniqueText,
      analysisStart: timestamp(row.analysisStart),
      analysisEnd: timestamp(row.analysisEnd),
      groupLabel: row.section === 'HAPs' ? "HAP'S" : row.section === 'BTEX' ? 'BTEX' : null,
      displayOrder: order,
      notes: notesOf(row),
    }
  })
}

const results = [
  ...confirmedResults(AgqAdapter, agqRaw),
  ...confirmedResults(ChemilabAdapter, chemilabRaw),
  ...confirmedResults(IhaAdapter, ihaRaw),
]
const byName = (name: string, list = results) => list.find((result) => result.parameterName === name)!

export function referenceInput(overrides: Partial<ReportModelInput> = {}): ReportModelInput {
  return {
    report: { code: 'RSA 0106-2026', issuedAt: '2026-07-10T09:00:00-05:00' },
    template: { code: 'SA-OP-LAA-TEC-FOR.6.1', version: 6, approvalDate: '2026-01-29' },
    client: { businessName: 'Cliente de prueba', nit: '000000000', address: 'Dirección de prueba', city: 'Bogotá D.C., Colombia' },
    contact: { name: 'Contacto de prueba', phone: '0000000000', email: 'contacto@ejemplo.co' },
    samples: [{
      id: 'sample-ag0346',
      code: 'AG0346',
      samplingPoint: 'SALIDA 1',
      planCode: 'PM0106',
      sampledAt: '2026-05-29T00:00:00-05:00',
      receivedAt: '2026-06-01T08:30:00-05:00',
      sampleType: 'ARnD',
      samplingType: 'Puntual - Compuesto',
      latitude: '4.6789261',
      longitude: '-74.10746675',
    }],
    results,
    regulations: [
      {
        columnOrder: 1,
        label: 'Res 631 de 2015 Art. 13 y 16 * Cosméticos',
        limits: {
          [byName('DEMANDA BIOQUÍMICA DE OXÍGENO').testId]: { value: 375, unit: 'mg O2/L' },
          [byName('Compuestos Orgánicos Halogenados Adsorbibles (AOX)').testId]: { specialValue: 'Análisis y Reporte' },
        },
      },
      {
        columnOrder: 2,
        label: 'Res 631 de 2015 Art. 13 y 16 ** Farmacéuticos',
        limits: {
          [byName('DEMANDA BIOQUÍMICA DE OXÍGENO').testId]: { value: 225, unit: 'mg O2/L' },
          [byName('Compuestos Orgánicos Halogenados Adsorbibles (AOX)').testId]: { specialValue: 'N.A' },
        },
      },
    ],
    ...overrides,
  }
}

