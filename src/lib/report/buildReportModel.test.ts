/**
 * Caso de referencia RSA 0106-2026 (muestra AG0346), armado con los informes
 * reales de AGQ, Chemilab e IHA (fixtures anonimizados) pasados por sus adaptadores.
 */
import { describe, expect, it } from 'vitest'
import agqRaw from '../adapters/__fixtures__/agq.txt?raw'
import chemilabRaw from '../adapters/__fixtures__/chemilab.txt?raw'
import ihaRaw from '../adapters/__fixtures__/iha.txt?raw'
import { AgqAdapter } from '../adapters/agq'
import { ChemilabAdapter } from '../adapters/chemilab'
import { IhaAdapter } from '../adapters/iha'
import type { LabPdfAdapter, PdfExtractedRow } from '../pdfAdapter'
import { buildReportModel, bogotaDate, canIssueReport } from './buildReportModel'
import type { ReportLaboratoryInput, ReportModelInput, ReportResultInput } from './types'

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

function referenceInput(overrides: Partial<ReportModelInput> = {}): ReportModelInput {
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

describe('buildReportModel — RSA 0106-2026 (AG0346)', () => {
  const model = buildReportModel(referenceInput())
  const rows = model.sections.flatMap((section) => section.rows)
  const row = (name: string) => rows.find((item) => item.parameter === name)!

  it('arma el encabezado versionado y los datos del cliente y la muestra', () => {
    expect(model.header).toEqual({
      title: 'REPORTE DE RESULTADOS',
      templateCode: 'SA-OP-LAA-TEC-FOR.6.1',
      templateVersion: '6',
      approvalDate: '2026-01-29',
      reportNumber: 'RSA 0106-2026',
      isDraft: false,
    })
    expect(model.client).toMatchObject({ businessName: 'Cliente de prueba', contact: 'Contacto de prueba', nit: '000000000' })
    expect(model.sampleInfo).toMatchObject({
      reportDate: '2026-07-10',
      receivedAt: '2026-06-01',
      sampledAt: '2026-05-29',
      planCode: 'PM0106',
      sampleType: 'ARnD',
      samplingType: 'Puntual - Compuesto',
      latitude: '4.6789261',
      longitude: '-74.10746675',
      sampleCount: 1,
    })
    expect(model.sampleColumns).toEqual([{ sampleId: 'sample-ag0346', code: 'AG0346', point: 'SALIDA 1' }])
  })

  it('calcula el periodo de análisis como mínimo inicio y máximo fin entre laboratorios', () => {
    // IHA inició el 2026-06-01 (DBO, análisis inmediato); AGQ terminó el 2026-07-09.
    // El RSA 0106-2026 impreso dice 2026-06-02: ver docs/MODELO_REPORTE.md.
    expect(model.sampleInfo.analysisPeriod).toEqual({ start: '2026-06-01', end: '2026-07-09' })
  })

  it('incluye las 50 filas numeradas y agrupa BTEX y HAP\'S', () => {
    expect(rows).toHaveLength(50)
    expect(rows.map((item) => item.item)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1))
    const groups = model.sections.filter((section) => section.label).map((section) => [section.label, section.rows.length])
    expect(groups).toEqual([["HAP'S", 17], ['BTEX', 8]])
  })

  it('conserva resultados, incertidumbre y LCM sin convertir ni redondear', () => {
    expect(row('Acenafteno')).toMatchObject({
      results: { 'sample-ag0346': { text: '< 0,040', uncertainty: '±17,1%' } },
      lcm: '0,040',
      unit: 'μg/L',
      accreditationCode: 'SA2',
      method: 'EPA8270E Rev6 2018 HAPs en Aguas',
      technique: 'GC/MS',
    })
    expect(row('Compuestos Orgánicos Halogenados Adsorbibles (AOX)')).toMatchObject({
      results: { 'sample-ag0346': { text: '0,473', uncertainty: '+/- 0,0344' } },
      lcm: '0,0500',
      unit: 'mg/L',
      accreditationCode: 'SA1',
      analysisStart: '2026-06-05',
    })
    expect(row('DEMANDA BIOQUÍMICA DE OXÍGENO')).toMatchObject({
      results: { 'sample-ag0346': { text: '<10', uncertainty: '9,64%' } },
      accreditationCode: 'SA3',
      limits: ['375', '225'],
    })
  })

  it('muestra límites especiales tal cual y advierte los límites que faltan', () => {
    expect(row('Compuestos Orgánicos Halogenados Adsorbibles (AOX)').limits).toEqual(['Análisis y Reporte', 'N.A'])
    expect(row('Acenafteno').limits).toEqual(['—', '—'])
    expect(model.issues.some((issue) => issue.code === 'LIMIT_MISSING' && issue.testId === row('Acenafteno').testId)).toBe(true)
  })

  it('arma la leyenda SA1-SA3 con las resoluciones del catálogo, no por orden de aparición', () => {
    // AGQ aparece primero en la tabla y aun así es SA2
    expect(rows[0].laboratory).toBe('AGQ Colombia')
    expect(model.legend).toEqual([
      { code: 'SA1', laboratory: 'Chemilab', resolution: LABS.CHEMILAB.accreditationResolution },
      { code: 'SA2', laboratory: 'AGQ Colombia', resolution: LABS.AGQ.accreditationResolution },
      { code: 'SA3', laboratory: 'IHA', resolution: LABS.IHA.accreditationResolution },
    ])
  })

  it('traslada las desviaciones del laboratorio a observaciones, con sus parámetros', () => {
    const deviations = model.observations.filter((item) => /desviaci/i.test(item.text))
    expect(deviations).toHaveLength(2)
    expect(deviations.every((item) => item.laboratory === 'Chemilab')).toBe(true)
    expect(deviations.flatMap((item) => item.parameters).sort()).toEqual([
      'Compuestos Orgánicos Halogenados Adsorbibles (AOX)',
      'Fósforo Reactivo Total (Leído como Ortofosfato)',
      'Nitratos',
      'Nitritos',
    ].sort())
    // Las notas técnicas de importación no son observaciones
    expect(model.observations.some((item) => /^Página \d+ del PDF$|^Marca del laboratorio/.test(item.text))).toBe(false)
  })

  it('bloquea la emisión mientras los metales "0,00" de AGQ no estén verificados', () => {
    const truncated = model.issues.filter((issue) => issue.code === 'TRUNCATED_VALUE')
    expect(truncated).toHaveLength(7)
    expect(canIssueReport(model)).toBe(false)
  })

  it('usa el texto corregido con motivo y entonces deja de bloquear ese valor', () => {
    const corrected = results.map((result) =>
      result.parameterName === 'Cobre' ? { ...result, reportedText: '0,0048' } : result)
    const fixed = buildReportModel(referenceInput({ results: corrected }))
    const cobre = fixed.sections.flatMap((section) => section.rows).find((item) => item.parameter === 'Cobre')!
    expect(cobre.results['sample-ag0346'].text).toBe('0,0048')
    expect(fixed.issues.filter((issue) => issue.code === 'TRUNCATED_VALUE')).toHaveLength(6)
  })
})

describe('buildReportModel — validaciones', () => {
  const aox = byName('Compuestos Orgánicos Halogenados Adsorbibles (AOX)')

  it('bloquea con datos del ensayo incompletos (caso "FALTA INFO" del catálogo)', () => {
    const model = buildReportModel(referenceInput({ results: [{ ...aox, methodText: null, lcmText: null }] }))
    const issue = model.issues.find((item) => item.code === 'TEST_DATA_INCOMPLETE')
    expect(issue?.message).toMatch(/método, LCM/)
    expect(canIssueReport(model)).toBe(false)
  })

  it('bloquea si la unidad del resultado y la del límite no coinciden (no convierte)', () => {
    const model = buildReportModel(referenceInput({
      results: [aox],
      regulations: [{ columnOrder: 1, label: 'Norma X', limits: { [aox.testId]: { value: 50, unit: 'µg/L' } } }],
    }))
    expect(model.issues.find((item) => item.code === 'UNIT_MISMATCH')?.message).toMatch(/mg\/L.*µg\/L/)
  })

  it('no confunde μ (mu griega) con µ (micro) al comparar unidades', () => {
    const acenafteno = byName('Acenafteno')
    const model = buildReportModel(referenceInput({
      results: [acenafteno],
      regulations: [{ columnOrder: 1, label: 'Norma X', limits: { [acenafteno.testId]: { value: 0.1, unit: 'µg/L' } } }],
    }))
    expect(model.issues.some((item) => item.code === 'UNIT_MISMATCH')).toBe(false)
    expect(model.sections[0].rows[0].limits).toEqual(['0,1'])
  })

  it('bloquea si un laboratorio subcontratado no tiene código SAn', () => {
    const model = buildReportModel(referenceInput({
      results: [{ ...aox, laboratory: { ...aox.laboratory, reportCode: null } }],
    }))
    expect(model.sections[0].rows[0].accreditationCode).toBeNull()
    expect(model.issues.find((item) => item.code === 'ACCREDITATION_CODE_MISSING')?.message).toMatch(/Chemilab/)
  })

  it('marca A o * para ensayos propios según su acreditación', () => {
    const own = { id: 'lab-gsa', name: 'GSA-LAA', accreditationResolution: 'Resolución N° 0398 del 06 de mayo de 2024' }
    const base = { ...aox, laboratory: own, executionType: 'SA' as const, notes: [] }
    const model = buildReportModel(referenceInput({
      results: [
        { ...base, id: 'ph', testId: 'ph', parameterName: 'pH (InSitu)', accreditationType: 'ACCREDITED' },
        { ...base, id: 'x', testId: 'x', parameterName: 'Ensayo propio no acreditado', accreditationType: 'NOT_ACCREDITED' },
      ],
    }))
    expect(model.sections[0].rows.map((item) => item.accreditationCode)).toEqual(['A', '*'])
    expect(model.legend.map((item) => item.code)).toEqual(['*', 'A'])
  })

  it('pone varias muestras como columnas de una misma fila', () => {
    const second = { id: 'sample-2', code: 'AG0347', samplingPoint: 'SALIDA 2' }
    const model = buildReportModel(referenceInput({
      samples: [...referenceInput().samples, second],
      results: [aox, { ...aox, id: 'aox-2', sampleId: 'sample-2', originalText: '<0,0500', uncertaintyText: null }],
    }))
    expect(model.sections[0].rows).toHaveLength(1)
    expect(model.sections[0].rows[0].results).toEqual({
      'sample-ag0346': { text: '0,473', uncertainty: '+/- 0,0344' },
      'sample-2': { text: '<0,0500', uncertainty: null },
    })
    expect(model.sampleInfo.sampleCount).toBe(2)
  })

  it('detecta resultados duplicados y borradores sin número', () => {
    const model = buildReportModel(referenceInput({ report: { code: null, draftDate: '2026-07-01' }, results: [aox, { ...aox, id: 'dup' }] }))
    expect(model.header).toMatchObject({ reportNumber: null, isDraft: true })
    expect(model.sampleInfo.reportDate).toBe('2026-07-01')
    expect(model.issues.some((item) => item.code === 'DUPLICATE_RESULT')).toBe(true)
  })

  it('bloquea sin cliente, muestras ni resultados', () => {
    const model = buildReportModel(referenceInput({ client: null, samples: [], results: [] }))
    expect(model.issues.map((item) => item.code)).toEqual(expect.arrayContaining(['CLIENT_MISSING', 'SAMPLES_MISSING', 'RESULTS_MISSING']))
  })

  it('convierte timestamptz a fecha calendario de Colombia', () => {
    expect(bogotaDate('2026-06-02T03:00:00Z')).toBe('2026-06-01')
    expect(bogotaDate('2026-06-02')).toBe('2026-06-02')
    expect(bogotaDate('no es fecha')).toBeNull()
  })
})
