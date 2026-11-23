import { describe, expect, it } from 'vitest'
import type { PdfExtractedRow } from '../../lib/pdfAdapter'
import type { ResultLoadOptions } from '../../types/results'
import {
  applyLearnedAlias,
  buildQuickRows,
  canLearnAlias,
  detectLaboratoryId,
  isDoubtful,
  isRowReady,
  matchAlias,
  normalizeName,
  remapRows,
  rowsForSample,
  suggestSampleColumn,
  toImportDraft,
} from './quickLoad'

const laboratories: ResultLoadOptions['laboratories'] = [
  { id: 'lab-sa', code: 'SA', name: 'Sierra Alta' },
  { id: 'lab-chemilab', code: 'SA1', name: 'Chemilab' },
  { id: 'lab-agq', code: 'SA2', name: 'AGQ' },
  { id: 'lab-iha', code: 'SA3', name: 'IHA' },
]

const aliases: ResultLoadOptions['aliases'] = [
  { test_id: 'test-ph', laboratory_id: 'lab-agq', external_name: 'pH' },
  { test_id: 'test-dqo', laboratory_id: null, external_name: 'Demanda Química de Oxígeno' },
  { test_id: 'test-a', laboratory_id: 'lab-agq', external_name: 'Hierro' },
  { test_id: 'test-b', laboratory_id: 'lab-agq', external_name: 'hierro' },
]

function extracted(overrides: Partial<PdfExtractedRow>): PdfExtractedRow {
  return {
    externalParameter: 'pH',
    externalResult: '7,2',
    externalUnit: 'Unidades',
    analysisStart: '2026-11-01',
    analysisEnd: '2026-11-02',
    ...overrides,
  }
}

describe('carga rápida: detección y mapeo', () => {
  it('normaliza mayúsculas, tildes y espacios', () => {
    expect(normalizeName('  Demanda  QUÍMICA de oxígeno ')).toBe('demanda quimica de oxigeno')
  })

  it('detecta el laboratorio del catálogo por el adaptador', () => {
    expect(detectLaboratoryId('AGQ', laboratories)).toBe('lab-agq')
    expect(detectLaboratoryId('CHEMILAB', laboratories)).toBe('lab-chemilab')
    expect(detectLaboratoryId('IHA', laboratories)).toBe('lab-iha')
    expect(detectLaboratoryId(null, laboratories)).toBeNull()
    expect(detectLaboratoryId('AGQ', [...laboratories, { id: 'otro', code: 'X', name: 'agq' }])).toBeNull()
  })

  it('mapea por alias del laboratorio o genérico, y no adivina si es ambiguo', () => {
    expect(matchAlias('PH', 'lab-agq', aliases)).toEqual({ testId: 'test-ph', status: 'EXACT' })
    expect(matchAlias('pH', 'lab-chemilab', aliases)).toEqual({ testId: '', status: 'NONE' })
    expect(matchAlias('demanda quimica de oxigeno', 'lab-iha', aliases).testId).toBe('test-dqo')
    expect(matchAlias('Hierro', 'lab-agq', aliases)).toEqual({ testId: '', status: 'AMBIGUOUS' })
  })
})

describe('carga rápida: qué es dudoso', () => {
  it('una fila con alias, resultado numérico, fechas y sin observaciones es segura', () => {
    const [row] = buildQuickRows('f1', [extracted({})], 'lab-agq', aliases)
    expect(row.doubts).toEqual([])
    expect(isDoubtful(row)).toBe(false)
    expect(isRowReady(row)).toBe(true)
  })

  it('marca sin alias, cualitativo, observaciones, sin fechas y LCM no numérico', () => {
    const [row] = buildQuickRows('f1', [extracted({
      externalParameter: 'Coliformes',
      externalResult: 'No detectado',
      observations: ['Muestra recibida fuera de temperatura'],
      analysisEnd: undefined,
      lcmText: 'N.A.',
    })], 'lab-agq', aliases)
    expect(row.doubts).toEqual(['NO_ALIAS', 'QUALITATIVE', 'LAB_OBSERVATIONS', 'MISSING_DATES', 'INVALID_LCM'])
    expect(isRowReady(row)).toBe(false)
  })

  it('una fila cualitativa queda lista solo con ensayo y texto confirmado, o excluida', () => {
    const [row] = buildQuickRows('f1', [extracted({ externalResult: 'Ver nota 3' })], 'lab-agq', aliases)
    expect(isRowReady(row)).toBe(false)
    expect(isRowReady({ ...row, qualitativeConfirmed: true })).toBe(true)
    expect(isRowReady({ ...row, excluded: true })).toBe(true)
  })

  it('al cambiar el laboratorio vuelve a mapear sin pisar lo elegido a mano', () => {
    const rows = buildQuickRows('f1', [extracted({}), extracted({ externalParameter: 'Sodio' })], null, aliases)
    expect(rows.map((row) => row.mappedTestId)).toEqual(['', ''])
    const chosen = [rows[0], { ...rows[1], mappedTestId: 'test-na', mappedBy: 'USER' as const }]
    const remapped = remapRows(chosen, 'lab-agq', aliases)
    expect(remapped[0]).toMatchObject({ mappedTestId: 'test-ph', mappedBy: 'ALIAS' })
    expect(remapped[0].doubts).not.toContain('NO_ALIAS')
    expect(remapped[1]).toMatchObject({ mappedTestId: 'test-na', mappedBy: 'USER' })
  })
})

describe('carga rápida: datos que se guardan', () => {
  it('conserva el texto original y la hora de Colombia', () => {
    const [row] = buildQuickRows('f1', [extracted({ externalResult: '<0,05', lcmText: '0,05', sourcePage: 2 })], 'lab-agq', aliases)
    expect(toImportDraft(row)).toMatchObject({
      external_parameter: 'pH',
      external_result: '<0,05',
      external_lcm: 0.05,
      analysis_start: '2026-11-01T00:00:00-05:00',
      mapped_test_id: 'test-ph',
      mapping_status: 'EXACT',
      validation_messages: ['Página 2 del PDF'],
    })
  })

  it('un ensayo elegido a mano se guarda como sugerido, no como exacto', () => {
    const [row] = buildQuickRows('f1', [extracted({ externalParameter: 'Sodio' })], 'lab-agq', aliases)
    expect(toImportDraft({ ...row, mappedTestId: 'test-na', mappedBy: 'USER' }).mapping_status).toBe('SUGGESTED')
  })
})

describe('carga rápida: alias aprendidos', () => {
  it('solo ofrece aprender cuando no había alias y la persona eligió el ensayo', () => {
    const [row] = buildQuickRows('f1', [extracted({ externalParameter: 'Sodio' })], 'lab-agq', aliases)
    expect(canLearnAlias(row)).toBe(false)
    expect(canLearnAlias({ ...row, mappedTestId: 'test-na', mappedBy: 'USER' })).toBe(true)
    const [safe] = buildQuickRows('f1', [extracted({})], 'lab-agq', aliases)
    expect(canLearnAlias({ ...safe, mappedBy: 'USER' })).toBe(false)
  })

  it('aplica el alias nuevo a las demás filas del mismo nombre y laboratorio', () => {
    const rows = [
      ...buildQuickRows('f1', [extracted({ externalParameter: 'Sodio' }), extracted({ externalParameter: 'SODIO ' })], 'lab-agq', aliases),
      ...buildQuickRows('f2', [extracted({ externalParameter: 'Sodio' })], 'lab-iha', aliases),
    ]
    rows[0] = { ...rows[0], mappedTestId: 'test-na', mappedBy: 'USER' }
    const updated = applyLearnedAlias(rows, new Map([['f1', 'lab-agq'], ['f2', 'lab-iha']]),
      { testId: 'test-na', laboratoryId: 'lab-agq', externalName: 'Sodio' })
    expect(updated[0]).toMatchObject({ mappedTestId: 'test-na', mappedBy: 'ALIAS' })
    expect(updated[0].doubts).not.toContain('NO_ALIAS')
    expect(updated[1]).toMatchObject({ mappedTestId: 'test-na', mappedBy: 'ALIAS' })
    expect(updated[2]).toMatchObject({ mappedTestId: '', mappedBy: null })
  })
})

describe('carga rápida: informes con varias muestras', () => {
  const columns = [
    { label: 'Salida 1 MD618744 AG0346', rows: [extracted({ externalResult: '1,1' })] },
    { label: 'Salida 2 MD618745 AG 0347', rows: [extracted({ externalResult: '2,2' })] },
  ]

  it('propone la columna cuya etiqueta contiene el código de la muestra', () => {
    expect(suggestSampleColumn(columns, 'AG0346')).toBe(0)
    expect(suggestSampleColumn(columns, 'ag0347')).toBe(1)
    expect(suggestSampleColumn(columns, 'AG0999')).toBeNull()
    expect(suggestSampleColumn([...columns, { label: 'copia AG0346', rows: [] }], 'AG0346')).toBeNull()
  })

  it('carga solo las filas de la columna elegida', () => {
    const result = { rows: [], requiresManualCapture: false, sampleColumns: columns }
    expect(rowsForSample(result, null)).toEqual([])
    expect(rowsForSample(result, 1)[0].externalResult).toBe('2,2')
    expect(rowsForSample({ rows: [extracted({})], requiresManualCapture: false }, null)).toHaveLength(1)
  })
})
