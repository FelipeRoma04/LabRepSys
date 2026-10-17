import { beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: database,
}))

import { importTestsCsv } from './catalogs'

describe('importación CSV de ensayos', () => {
  beforeEach(() => {
    database.from.mockReset()
  })

  it('informa el número y la causa de cada fila rechazada', async () => {
    const insert = vi.fn(async (record: Record<string, unknown>) => ({
      error: record.code === 'SA-004' ? { message: 'Código duplicado.' } : null,
    }))
    database.from.mockReturnValue({ insert })

    const errors = await importTestsCsv([
      'code,parameter_name,lcm',
      'SA-001,"Plomo, total","0,040"',
      'AGQ-002,Arsénico,1',
      'SA-003,Mercurio,no-numero',
      'SA-004,Duplicado,2',
    ].join('\n'))

    expect(errors).toEqual([
      { row: 3, message: 'El código vigente debe tener prefijo SA.' },
      { row: 4, message: 'LCM debe ser un número válido.' },
      { row: 5, message: 'Código duplicado.' },
    ])
    expect(insert).toHaveBeenCalledTimes(2)
    expect(insert).toHaveBeenNthCalledWith(1, {
      code: 'SA-001',
      parameter_name: 'Plomo, total',
      lcm: 0.04,
    })
  })

  it('rechaza encabezados desconocidos y CSV con comillas sin cerrar', async () => {
    await expect(importTestsCsv('code,unknown\nSA-1,x')).rejects.toThrow(
      'Encabezados no reconocidos: unknown.',
    )
    await expect(importTestsCsv('code,parameter_name\nSA-1,"Plomo')).rejects.toThrow(
      'El CSV tiene una celda entrecomillada sin cerrar.',
    )
  })
})
