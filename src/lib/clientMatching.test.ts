import { describe, expect, it } from 'vitest'
import { matchClient, normalizeBusinessName, sameNit, type ClientCandidate } from './clientMatching'

const CLIENTS: ClientCandidate[] = [
  { id: 'c1', nit: '830.113.152-8', business_name: 'INSTITUTO DE HIGIENE AMBIENTAL S.A.S' },
  { id: 'c2', nit: '900000001', business_name: 'Laboratorio Ejemplo Ltda.', alias: 'LabEj' },
  { id: 'c3', nit: null, business_name: 'Comercial Andina S.A.' },
  { id: 'c4', nit: null, business_name: 'Comercial Andina SA' },
]

describe('normalizeBusinessName', () => {
  it('ignora mayúsculas, tildes, puntuación y la forma de escribir la sociedad', () => {
    expect(normalizeBusinessName('Instituto de Higiene Ambiental SAS'))
      .toBe(normalizeBusinessName('INSTITUTO DE HIGIENE AMBIENTAL S.A.S'))
    expect(normalizeBusinessName('Ingeniería  Ambiental S. A. S.')).toBe('ingenieria ambiental sas')
    expect(normalizeBusinessName('Agua & Suelo E.S.P.')).toBe('agua y suelo esp')
  })
})

describe('sameNit', () => {
  it('compara con o sin puntos, guion y dígito de verificación', () => {
    expect(sameNit('830.113.152-8', '8301131528')).toBe(true)
    expect(sameNit('830.113.152-8', '830113152')).toBe(true)
    expect(sameNit('830113152', '830113153')).toBe(false)
    expect(sameNit('', '830113152')).toBe(false)
  })
})

describe('matchClient', () => {
  it('encuentra por NIT aunque falte el dígito de verificación', () => {
    expect(matchClient(CLIENTS, { nit: '830113152' })).toMatchObject({ status: 'MATCHED', by: 'NIT', client: { id: 'c1' } })
  })

  it('encuentra por razón social escrita distinto (el caso que la macro dejaba vacío)', () => {
    expect(matchClient(CLIENTS, { name: 'Instituto de Higiene Ambiental SAS' }))
      .toMatchObject({ status: 'MATCHED', by: 'NAME', client: { id: 'c1' } })
  })

  it('encuentra por alias registrado', () => {
    expect(matchClient(CLIENTS, { name: 'labej' })).toMatchObject({ status: 'MATCHED', client: { id: 'c2' } })
  })

  it('no adivina cuando hay varias coincidencias', () => {
    const result = matchClient(CLIENTS, { name: 'comercial andina s.a.' })
    expect(result.status).toBe('AMBIGUOUS')
    expect(result.status === 'AMBIGUOUS' && result.candidates.map((c) => c.id)).toEqual(['c3', 'c4'])
  })

  it('reporta no encontrado en lugar de dejar el campo vacío', () => {
    expect(matchClient(CLIENTS, { name: 'Proveedor Inexistente' })).toEqual({ status: 'NOT_FOUND' })
    expect(matchClient(CLIENTS, {})).toEqual({ status: 'NOT_FOUND' })
  })
})
