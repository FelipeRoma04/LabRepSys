import { describe, expect, it } from 'vitest'
import { parseRegulationCsv, regulationCsvTemplate } from './regulations'

describe('importación CSV de normativa', () => {
  it('descarga una plantilla sin límites precargados ni códigos inventados', () => {
    expect(regulationCsvTemplate).toContain('article,activity,discharge_type')
    expect(regulationCsvTemplate.split('\r\n')).toHaveLength(1)
  })

  it('conserva comas y comillas escapadas dentro de celdas entrecomilladas', () => {
    const rows = parseRegulationCsv([
      'article,activity,discharge_type,description,test_code,limit_operator,limit_value,limit_text,unit,special_value',
      '8,"Actividad, ""A""",ARD,nota,SA-123,,,N.R.,,N_R',
    ].join('\n'))

    expect(rows).toEqual([{
      row_number: 2,
      article: '8',
      activity: 'Actividad, "A"',
      discharge_type: 'ARD',
      description: 'nota',
      test_code: 'SA-123',
      limit_operator: '',
      limit_value: '',
      limit_text: 'N.R.',
      unit: '',
      special_value: 'N_R',
    }])
  })

  it('rechaza encabezados incompletos, duplicados y desconocidos con error visible', () => {
    expect(() => parseRegulationCsv('article,activity')).toThrow('Faltan encabezados requeridos')
    expect(() => parseRegulationCsv(
      'article,article,activity,discharge_type,test_code,limit_operator,limit_value,special_value',
    )).toThrow('encabezados duplicados')
    expect(() => parseRegulationCsv(
      'article,activity,discharge_type,test_code,limit_operator,limit_value,special_value,other',
    )).toThrow('Encabezados no reconocidos')
  })
})
