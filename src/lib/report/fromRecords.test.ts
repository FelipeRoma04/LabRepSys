/**
 * RSA 0106-2026 (AG0346) armado como lo guarda el snapshot de emisión, a partir de los
 * informes reales anonimizados de AGQ, Chemilab e IHA.
 */
import { describe, expect, it } from 'vitest'
import agqRaw from '../adapters/__fixtures__/agq.txt?raw'
import chemilabRaw from '../adapters/__fixtures__/chemilab.txt?raw'
import ihaRaw from '../adapters/__fixtures__/iha.txt?raw'
import { AgqAdapter } from '../adapters/agq'
import { ChemilabAdapter } from '../adapters/chemilab'
import { IhaAdapter } from '../adapters/iha'
import type { LabPdfAdapter, PdfExtractedRow } from '../pdfAdapter'
import { buildReportModel, canIssueReport } from './buildReportModel'
import { regulationLabel, toReportModelInput, type ReportRecordResult, type ReportRecords } from './fromRecords'

const LABS = {
  CHEMILAB: { id: 'lab-chem', name: 'Chemilab', laboratory_type: 'EXTERNAL' as const, report_code: 'SA1', accreditation_resolution: 'Resolución No. 1042 del 26 de septiembre del 2024' },
  AGQ: { id: 'lab-agq', name: 'AGQ Colombia', laboratory_type: 'EXTERNAL' as const, report_code: 'SA2', accreditation_resolution: 'Resolución No. 1080 del 09 de septiembre de 2025' },
  IHA: { id: 'lab-iha', name: 'IHA', laboratory_type: 'EXTERNAL' as const, report_code: 'SA3', accreditation_resolution: 'Resolución No. 0443 del 20 de abril de 2026' },
}

function notes(row: PdfExtractedRow): string[] {
  return [`Página ${row.sourcePage} del PDF`, ...(row.marker ? [`Marca del laboratorio: ${row.marker}`] : []), ...(row.observations ?? [])]
}

let order = 0
function snapshotResults(adapter: LabPdfAdapter, raw: string): ReportRecordResult[] {
  return adapter.extract(raw.replace(/\r\n/g, '\n')).rows.map((row, index) => ({
    id: `${adapter.id}-${index}`,
    sample_id: 's-ag0346',
    test_id: `${adapter.id}-${index}`,
    original_text: row.externalResult,
    reported_text: row.externalResult,
    unit: row.externalUnit ?? null,
    lcm: row.lcmText ? Number(row.lcmText.replace(',', '.')) : null,
    uncertainty_text: row.uncertaintyText ?? null,
    method_text: row.methodText ?? null,
    technique_text: row.techniqueText ?? null,
    accreditation_type: 'ACCREDITED',
    analysis_start: row.analysisStart ? `${row.analysisStart}T05:00:00+00:00` : null,
    analysis_end: row.analysisEnd ? `${row.analysisEnd}T05:00:00+00:00` : null,
    test: { code: `${adapter.id}-${index}`, parameter_name: row.externalParameter },
    laboratory: LABS[adapter.id as keyof typeof LABS],
    execution_type: 'SUBCONTRACTED',
    group_label: row.section === 'HAPs' ? "HAP'S" : row.section === 'BTEX' ? 'BTEX' : null,
    display_order: ++order,
    notes: notes(row),
  }))
}

const SNAPSHOT: ReportRecords = {
  code: 'RSA 0106-2026',
  issued_at: '2026-07-10T14:00:00+00:00',
  template: { code: 'SA-OP-LAA-TEC-FOR.6.1', version: 6, approval_date: '2026-01-29', configuration: { header: { documentTypeLabel: 'REPORTE DE RESULTADOS' } } },
  client: { business_name: 'Cliente de prueba', nit: '000000000', address: 'Dirección de prueba', city: 'Bogotá D.C., Colombia' },
  contact: { name: 'Contacto de prueba', phone: '0000000000', email: 'contacto@ejemplo.co' },
  samples: [{
    id: 's-ag0346',
    code: 'AG0346',
    sampling_point: 'SALIDA 1',
    plan_code: 'PM0106',
    sampled_at: '2026-05-29T05:00:00+00:00',
    received_at: '2026-06-01T13:30:00+00:00',
    matrix: { code: 'ARND', name: 'ARnD' },
    field_data: { latitude_original: '4.6789261', longitude_original: '-74.10746675' },
  }],
  results: [
    ...snapshotResults(AgqAdapter, agqRaw),
    ...snapshotResults(ChemilabAdapter, chemilabRaw),
    ...snapshotResults(IhaAdapter, ihaRaw),
  ],
  regulations: [{
    column_order: 1,
    name: 'Res 631 de 2015',
    article: 'Art. 13 y 16',
    activity: 'Cosméticos',
    limits: [{ test_id: 'IHA-0', limit_value: 375, unit: 'mg O2/L' }],
  }],
}

describe('toReportModelInput (snapshot de emisión)', () => {
  const model = buildReportModel(toReportModelInput(SNAPSHOT))
  const rows = model.sections.flatMap((section) => section.rows)

  it('produce el modelo completo del RSA 0106-2026', () => {
    expect(model.header).toMatchObject({ reportNumber: 'RSA 0106-2026', templateCode: 'SA-OP-LAA-TEC-FOR.6.1', templateVersion: '6', isDraft: false })
    expect(model.sampleInfo).toMatchObject({
      reportDate: '2026-07-10',
      receivedAt: '2026-06-01',
      sampledAt: '2026-05-29',
      planCode: 'PM0106',
      sampleType: 'ARnD',
      latitude: '4.6789261',
      longitude: '-74.10746675',
    })
    expect(rows).toHaveLength(50)
  })

  it('lleva las siglas SAn y las resoluciones guardadas en el snapshot', () => {
    expect(model.legend.map((entry) => `${entry.code} ${entry.laboratory}`)).toEqual(['SA1 Chemilab', 'SA2 AGQ Colombia', 'SA3 IHA'])
    expect(model.legend.every((entry) => entry.resolution)).toBe(true)
  })

  it('traslada las desviaciones guardadas en las notas del resultado', () => {
    expect(model.observations.filter((item) => /desviaci/i.test(item.text)).flatMap((item) => item.parameters)).toContain('Nitratos')
  })

  it('arma el rótulo de la columna normativa y su límite', () => {
    expect(model.regulationColumns[0].label).toBe('Res 631 de 2015 · Art. 13 y 16 · Cosméticos')
    expect(rows.find((row) => row.parameter === 'DEMANDA BIOQUÍMICA DE OXÍGENO')?.limits).toEqual(['375'])
  })

  it('bloquea la emisión con los metales "0,00" sin verificar', () => {
    expect(canIssueReport(model)).toBe(false)
    expect(model.issues.filter((issue) => issue.code === 'TRUNCATED_VALUE')).toHaveLength(7)
  })
})

describe('toReportModelInput (datos incompletos)', () => {
  it('sin execution_type trata un laboratorio no interno como subcontratado y exige su sigla', () => {
    const model = buildReportModel(toReportModelInput({
      ...SNAPSHOT,
      results: [{ ...SNAPSHOT.results![0], execution_type: null, laboratory: { name: 'Lab X' } }],
    }))
    expect(model.issues.some((issue) => issue.code === 'ACCREDITATION_CODE_MISSING')).toBe(true)
  })

  it('sin cliente ni plantilla no inventa datos', () => {
    const input = toReportModelInput({ results: [], samples: [] }, { draftDate: '2026-07-01T10:00:00Z' })
    expect(input.client).toBeNull()
    expect(input.template.code).toBe('Plantilla no asignada')
    expect(input.report.draftDate).toBe('2026-07-01T10:00:00Z')
  })

  it('el rótulo normativo tiene un respaldo si faltan datos', () => {
    expect(regulationLabel({ column_order: 2 })).toBe('Normativa 2')
  })
})
