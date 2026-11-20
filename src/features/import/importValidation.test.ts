import { describe, expect, it } from 'vitest'
import { validateSampleRows } from './sampleImportService'
import { validateTestRows } from './testImportService'
import { escapeCsvCell, generateErrorReportCsv } from './errorReport'

describe('Excel import validation', () => {
  it('rejects AG00106 and flags external laboratory observations for manual structuring', async () => {
    const result = await validateSampleRows(
      [
        { _rowNumber: 2, Code: 'AG00106', NIT: '900123456', Matriz: 'AS', Observaciones: '' },
        { _rowNumber: 3, Code: 'AG0346', NIT: '900123456', Matriz: 'AS', Observaciones: 'Enviar a laboratorio externo' },
        { _rowNumber: 4, Code: 'AG0346', NIT: '900123456', Matriz: 'AS', Observaciones: '' },
      ],
      { code: 'Code', client_nit: 'NIT', matrix_code: 'Matriz', observations: 'Observaciones' },
      'ejemplo.xlsx',
      'a'.repeat(64),
      'RECEPCION MUESTRAS',
      {
        clients: [{ id: 'client-1', nit: '900123456', business_name: 'Cliente de prueba', active: true }],
        matrices: [{ id: 'matrix-1', code: 'AS', name: 'Agua superficial', active: true }],
      },
    )

    expect(result.rows[0].isValid).toBe(false)
    expect(result.rows[0].issues.some((issue) => issue.field === 'code')).toBe(true)
    expect(result.rows[1].isValid).toBe(true)
    expect(result.rows[1].requiresManualStructuring).toBe(true)
    expect(result.rows[2].isValid).toBe(false)
    expect(result.rows[2].issues.some((issue) => issue.message.includes('repetido dentro del archivo'))).toBe(true)
  })

  it('accepts SA test codes and rejects sample codes such as AG00106', async () => {
    const result = await validateTestRows(
      [
        { _rowNumber: 2, Code: 'SA001', Parameter: 'pH' },
        { _rowNumber: 3, Code: 'AG00106', Parameter: 'Plomo' },
      ],
      { code: 'Code', parameter_name: 'Parameter' },
      'ensayos.xlsx',
      'b'.repeat(64),
      'LABORATORIO',
    )

    expect(result.rows[0].isValid).toBe(true)
    expect(result.rows[1].isValid).toBe(false)
  })

  it('protects downloadable error CSV cells against spreadsheet formula injection', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1")
    expect(escapeCsvCell('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)")
    expect(escapeCsvCell('-1+2')).toBe("'-1+2")
    expect(escapeCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)")
    expect(escapeCsvCell('safe, "quoted"')).toBe('"safe, ""quoted"""')

    const csv = generateErrorReportCsv([
      { row: 2, field: 'code', severity: 'error', message: '=HYPERLINK("https://example.test")' },
    ], 'demo.xlsx', 'samples')
    expect(csv).toContain("'=HYPERLINK(")
  })

})
