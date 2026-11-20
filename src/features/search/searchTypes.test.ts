import { describe, expect, it } from 'vitest'
import { canExportSearch, createSearchCsv, escapeCsvCell } from './searchTypes'

describe('exportación de búsqueda', () => {
  it('neutraliza celdas que comienzan con caracteres de fórmula', () => {
    expect(escapeCsvCell('=1+1')).toBe('"\'=1+1"')
    expect(escapeCsvCell('+SUM(A1:A2)')).toBe('"\'+SUM(A1:A2)"')
    expect(escapeCsvCell('-10')).toBe('"\'-10"')
    expect(escapeCsvCell('@cmd')).toBe('"\'@cmd"')
    expect(escapeCsvCell('  =1+1')).toBe('"\'  =1+1"')
  })

  it('escapa delimitadores CSV y neutraliza fórmulas en resultados', () => {
    const csv = createSearchCsv([{
      id: '1',
      type: 'sample',
      title: '=HYPERLINK("x")',
      subtitle: '',
      status: 'RECEIVED',
      date: null,
      clientId: null,
      clientName: 'Cliente, "A"',
    }])

    expect(csv).toContain('"\'=HYPERLINK(""x"")"')
    expect(csv).toContain('"Cliente, ""A"""')
  })

  it('autoriza exportar únicamente a los roles permitidos', () => {
    expect(canExportSearch(['ADMIN'])).toBe(true)
    expect(canExportSearch(['ANALISTA'])).toBe(true)
    expect(canExportSearch(['JEFE_TECNICA_CALIDAD'])).toBe(true)
    expect(canExportSearch(['AUDITOR'])).toBe(true)
    expect(canExportSearch(['RECEPCION'])).toBe(false)
    expect(canExportSearch(['COMERCIAL'])).toBe(false)
  })
})
