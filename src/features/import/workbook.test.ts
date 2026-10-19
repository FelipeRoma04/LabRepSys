import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { computeFileHash, loadWorkbook, readSheetRawRows } from './excelReader'

async function makeFile(): Promise<File> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('RECEPCION MUESTRAS')
  sheet.addRow(['Código', 'Fecha', 'Observaciones'])
  sheet.addRow(['AG0346', 46023, 'Laboratorio externo: revisar'])
  sheet.addRow(['AG00106', null, ''])
  sheet.getCell('A3').value = { formula: '"AG00106"', result: 'AG00106' }
  const bytes = await workbook.xlsx.writeBuffer()
  return new File([bytes], 'recepcion.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('Excel workbook reader', () => {
  it('reads worksheet data and cached formula results without evaluating formulas', async () => {
    const file = await makeFile()
    const buffer = await file.arrayBuffer()
    const workbook = await loadWorkbook(buffer)
    const sheet = workbook.getWorksheet('RECEPCION MUESTRAS')
    expect(sheet).toBeDefined()
    const data = readSheetRawRows(sheet!)

    expect(data.headers).toEqual(['Código', 'Fecha', 'Observaciones'])
    expect(data.rows).toHaveLength(2)
    expect(data.rows[0].Código).toBe('AG0346')
    expect(data.rows[1].Código).toBe('AG00106')
    expect(await computeFileHash(buffer)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('reports a finite row limit instead of reading an unbounded sheet', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Datos')
    sheet.addRow(['Código'])
    sheet.addRow(['AG0346'])
    sheet.addRow(['AG0347'])
    const data = readSheetRawRows(sheet, 1)
    expect(data.totalRows).toBe(2)
    expect(data.rows).toHaveLength(1)
  })
})
