/**
 * Pruebas de los adaptadores de PDF contra texto extraído de informes reales,
 * ANONIMIZADO (sin datos de clientes ni personas). Ver docs/ADAPTADORES_PDF.md.
 */
import { describe, expect, it } from 'vitest'
import agqRaw from './__fixtures__/agq.txt?raw'
import chemilabRaw from './__fixtures__/chemilab.txt?raw'
import ihaRaw from './__fixtures__/iha.txt?raw'
import { extractWithAdapter, findAdapter } from './index'
import { AgqAdapter, TRUNCATED_ZERO_NOTE } from './agq'
import { ChemilabAdapter } from './chemilab'
import { IhaAdapter } from './iha'
import { distributeCenteredFragments, dmyToIso, spanishShortDateToIso } from './common'
import { parseResult } from '../parseResult'

const normalize = (text: string) => text.replace(/\r\n/g, '\n')
const agq = normalize(agqRaw)
const chemilab = normalize(chemilabRaw)
const iha = normalize(ihaRaw)

describe('detección por contenido', () => {
  it('elige el adaptador correcto para cada informe', () => {
    expect(findAdapter(agq)?.id).toBe('AGQ')
    expect(findAdapter(chemilab)?.id).toBe('CHEMILAB')
    expect(findAdapter(iha)?.id).toBe('IHA')
  })

  it('no reconoce un documento cualquiera aunque mencione IHA, AGQ o Chemilab', () => {
    const text = 'Cotización enviada a IHA, AGQ y Chemilab para la campaña de monitoreo del próximo año.'
    expect(findAdapter(text)).toBeNull()
    const { adapter, result } = extractWithAdapter(text)
    expect(adapter).toBeNull()
    expect(result.requiresManualCapture).toBe(true)
  })

  it('un PDF sin capa de texto (escaneado) degrada a captura manual', () => {
    const { result } = extractWithAdapter(' \n\f\n  ')
    expect(result.requiresManualCapture).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.warnings?.[0]).toMatch(/capa de texto/)
  })

  it('si el adaptador falla, no lanza: degrada a captura manual', () => {
    const original = AgqAdapter.extract
    AgqAdapter.extract = () => { throw new Error('boom') }
    try {
      const { result } = extractWithAdapter(agq)
      expect(result.requiresManualCapture).toBe(true)
      expect(result.warnings?.[0]).toMatch(/falló/)
    } finally {
      AgqAdapter.extract = original
    }
  })
})

describe('AGQ', () => {
  const result = AgqAdapter.extract(agq)
  const byName = (name: string) => result.rows.filter((row) => row.externalParameter === name)

  it('extrae las 40 filas con sus secciones', () => {
    expect(result.requiresManualCapture).toBe(false)
    expect(result.rows).toHaveLength(40)
    const sections = result.rows.reduce<Record<string, number>>((count, row) => {
      count[row.section ?? ''] = (count[row.section ?? ''] ?? 0) + 1
      return count
    }, {})
    expect(sections).toEqual({
      'Parámetros Físico-Químicos': 5,
      Hidrocarburos: 1,
      HAPs: 17,
      'Compuestos Fenólicos': 1,
      BTEX: 8,
      Metales: 8,
    })
    expect(result.unrecognizedLines).toEqual([])
  })

  it('une resultado y anexo técnico sin modificar el texto', () => {
    expect(byName('Aceites y Grasas')[0]).toMatchObject({
      externalResult: '< 4,000',
      externalUnit: 'mg/L',
      uncertaintyText: '±6,72%',
      lcmText: '4,000',
      methodText: 'SM 5520 C GyA',
      techniqueText: 'FTIR',
      analysisStart: '2026-06-04',
      analysisEnd: '2026-07-09',
      sourcePage: 2,
    })
    expect(byName('Acenafteno')[0]).toMatchObject({
      externalResult: '< 0,040',
      externalUnit: 'μg/L',
      uncertaintyText: '±17,1%',
      lcmText: '0,040',
      methodText: 'EPA8270E Rev6 2018 HAPs en Aguas',
      techniqueText: 'GC/MS',
    })
    expect(byName('Fenoles')[0]).toMatchObject({ externalResult: '0,170', uncertaintyText: '±12,6%', lcmText: '0,100' })
  })

  it('distingue los dos "Xilenos" por orden de aparición', () => {
    expect(byName('Xilenos').map((row) => row.uncertaintyText)).toEqual(['±18,3%', '±13,4%'])
  })

  it('separa la marca del laboratorio, también cuando viene pegada al nombre', () => {
    expect(byName('Suma HAPs')[0]).toMatchObject({ marker: '*', uncertaintyText: undefined })
    expect(byName('Suma BTEX')[0].marker).toBe('*')
    expect(byName('Arsénico')[0].marker).toBe('*A')
    expect(byName('Zinc')[0]).toMatchObject({ marker: '*A', sourcePage: 3, externalResult: '< 0,09' })
  })

  it('advierte de los metales "0,00" (pérdida de precisión del PDF)', () => {
    expect(byName('Cobre')[0]).toMatchObject({ externalResult: '0,00', lcmText: '0,00' })
    expect(byName('Cobre')[0].observations).toContain(TRUNCATED_ZERO_NOTE)
    expect(byName('Zinc')[0].observations).not.toContain(TRUNCATED_ZERO_NOTE)
    expect(result.rows.filter((row) => row.observations?.includes(TRUNCATED_ZERO_NOTE))).toHaveLength(7)
    expect(result.warnings?.join(' ')).toMatch(/7 resultado/)
  })

  it('entrega datos del documento y sus observaciones, sin datos del cliente', () => {
    expect(result.documentInfo).toMatchObject({
      'Fecha de muestreo': '2026-05-29',
      'Fecha de recepción': '2026-06-04',
      'Fecha de emisión': '2026-07-10',
    })
    expect(JSON.stringify(result.documentInfo)).not.toMatch(/Cliente|Domicilio|EMPRESA/i)
    expect(result.documentObservations?.[0]).toMatch(/envases BTEX/)
  })

  it('formato sin la tabla de resultados conocida degrada a captura manual', () => {
    const altered = agq.replace(/Resultado(\s+)Unidades/g, 'Valor    $1Unidades')
    const altResult = AgqAdapter.extract(altered)
    expect(altResult.requiresManualCapture).toBe(true)
    expect(altResult.warnings?.[0]).toMatch(/no reconocido/)
  })
})

describe('Chemilab', () => {
  const result = ChemilabAdapter.extract(chemilab)

  it('extrae las 9 filas con nombres multilínea correctos', () => {
    expect(result.requiresManualCapture).toBe(false)
    expect(result.rows.map((row) => row.externalParameter)).toEqual([
      'Compuestos Orgánicos Halogenados Adsorbibles (AOX)',
      'Fósforo Reactivo Total (Leído como Ortofosfato)',
      'Fósforo total',
      'Nitratos',
      'Nitritos',
      'Nitrogeno Amoniacal',
      'Nitrógeno Total',
      'Sulfatos',
      'Sulfuros',
    ])
    expect(result.rows.every((row) => row.marker === '*')).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('separa resultado e incertidumbre absoluta sin normalizarla', () => {
    expect(result.rows[0]).toMatchObject({
      externalResult: '0,473',
      uncertaintyText: '+/- 0,0344',
      externalUnit: 'mg/L',
      lcmText: '0,0500',
      methodText: 'ISO 9562:2004',
      techniqueText: 'Microcolumbiometria',
      analysisStart: '2026-06-05',
      analysisEnd: '2026-06-05',
      sourcePage: 1,
    })
    expect(result.rows[1]).toMatchObject({ externalResult: '<0,0700', uncertaintyText: undefined, externalUnit: 'mg P/L' })
    expect(result.rows[3]).toMatchObject({ externalResult: '1,03', uncertaintyText: '+/- 0,0892', externalUnit: 'mgNNO3/L', lcmText: '1,00' })
    expect(result.rows[4]).toMatchObject({ externalResult: '<0,00608', lcmText: '0,00608', externalUnit: 'mg N-NO2/L' })
    expect(result.rows[6]).toMatchObject({ externalResult: '3,73', uncertaintyText: '+/- 0,133', methodText: 'UNE EN ISO 20236:2022', techniqueText: 'Combustión' })
    expect(result.rows[7]).toMatchObject({ externalResult: '22,6', uncertaintyText: '+/- 1,12', lcmText: '5,00' })
  })

  it('liga las desviaciones de método solo a los parámetros mencionados', () => {
    const withDeviation = result.rows
      .filter((row) => row.observations?.some((note) => /desviaci/i.test(note)))
      .map((row) => row.externalParameter)
    expect(withDeviation).toEqual([
      'Compuestos Orgánicos Halogenados Adsorbibles (AOX)',
      'Fósforo Reactivo Total (Leído como Ortofosfato)',
      'Nitratos',
      'Nitritos',
    ])
  })

  it('entrega datos del documento para cotejar con la muestra', () => {
    expect(result.detectedFormatVersion).toBe('15/2025-10-13')
    expect(result.documentInfo).toMatchObject({
      'Fecha de recepción': '2026-06-02',
      'Fecha de muestreo': '2026-05-26',
      'Fecha de emisión': '2026-06-24',
      'Tipo de muestra marcado': 'ARD',
    })
  })

  it('advierte si la versión del formato es distinta a la conocida', () => {
    const other = ChemilabAdapter.extract(chemilab.replace(/Versión N° 15\//g, 'Versión N° 16/'))
    expect(other.warnings?.[0]).toMatch(/16\/2025-10-13 distinta/)
    expect(other.rows).toHaveLength(9)
  })

  it('no adivina con varias muestras: captura manual', () => {
    const multi = ChemilabAdapter.extract(chemilab.replace(/(Número total de muestras:\s+)1/g, '$12'))
    expect(multi.requiresManualCapture).toBe(true)
    expect(multi.rows).toEqual([])
  })
})

describe('IHA', () => {
  const result = IhaAdapter.extract(iha)

  it('extrae la fila de DBO con método multilínea y marcas separadas', () => {
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      externalParameter: 'DEMANDA BIOQUÍMICA DE OXÍGENO',
      marker: '(A) (*)',
      externalUnit: 'mg O2/L',
      externalResult: '<10',
      uncertaintyText: '9,64%',
      lcmText: '10,0',
      methodText: 'SM 5210 B, SM 4500-O H. SM 2023, Edición 24',
      techniqueText: 'FOTOMETRÍA',
      analysisStart: '2026-06-01',
      analysisEnd: '2026-06-07',
      sourcePage: 1,
    })
  })

  it('conserva las observaciones del documento y advierte la nota de DBO₅', () => {
    expect(result.documentObservations?.[0]).toMatch(/^NOTA: El cliente autorizó/)
    expect(result.warnings?.join(' ')).toMatch(/DBO₅/)
    expect(result.documentInfo).toMatchObject({ 'Sitio de muestreo': 'AG0346 - Salida 1', 'Fecha de muestreo': '2026-05-29' })
  })
})

describe('regla de oro: el texto original llega intacto a parseResult', () => {
  it('"< 0,040" se conserva y parseResult lo interpreta aparte', () => {
    const row = AgqAdapter.extract(agq).rows.find((candidate) => candidate.externalParameter === 'Acenafteno')!
    expect(row.externalResult).toBe('< 0,040')
    const parsed = parseResult(row.externalResult)
    expect(parsed).toMatchObject({ type: 'numeric', operator: '<', numericValue: 0.04, originalText: '< 0,040' })
  })
})

describe('utilidades', () => {
  it('convierte fechas solo desde formatos inequívocos del laboratorio', () => {
    expect(dmyToIso('04/06/2026')).toBe('2026-06-04')
    expect(dmyToIso('31/02/2026')).toBeUndefined()
    expect(spanishShortDateToIso('1-jun-26')).toBe('2026-06-01')
    expect(spanishShortDateToIso('7-xyz-26')).toBeUndefined()
  })

  it('reparte fragmentos centrados o se niega si no es posible', () => {
    expect(distributeCenteredFragments([1, 2, 1])).toEqual([{ above: 1, below: 1 }, { above: 1, below: 1 }])
    expect(distributeCenteredFragments([0, 0, 0])).toEqual([{ above: 0, below: 0 }, { above: 0, below: 0 }])
    expect(distributeCenteredFragments([2, 1])).toBeNull()
  })
})
