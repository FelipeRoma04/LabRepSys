import { describe, expect, it } from 'vitest'
import { previewSamplesCsv } from './samples'

const clients = [{
  id: 'client-1',
  nit: '900123456',
  business_name: 'Cliente de prueba',
}]
const matrices = [{ id: 'matrix-1', code: 'AG', name: 'Agua' }]

describe('previsualización de importación CSV de muestras', () => {
  it('acepta AG0346 y resuelve cliente y matriz sin ejecutar contenido externo', async () => {
    const rows = await previewSamplesCsv(
      'code,client_nit,matrix_code,plan_code,sampling_point,sampled_at\nAG0346,900123456,AG,P-1,Punto 1,2026-10-16T10:00:00-05:00',
      clients,
      matrices,
      '^AG[0-9]{4}$',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].client_id).toBe('client-1')
    expect(rows[0].matrix_id).toBe('matrix-1')
    expect(rows[0].issues).toEqual([])
  })

  it('rechaza AG00106 e informa cliente y matriz no encontrados', async () => {
    const rows = await previewSamplesCsv(
      'code,client_nit,matrix_code,plan_code,sampling_point,sampled_at\nAG00106,unknown,missing,,,',
      clients,
      matrices,
      '^AG[0-9]{4}$',
    )
    expect(rows[0].issues.map((issue) => issue.message)).toEqual([
      'Código de muestra inválido según el patrón configurado.',
      'Cliente no encontrado.',
      'Matriz no encontrada.',
    ])
  })

  it('marca fechas futuras y años distintos como advertencias, no como correcciones', async () => {
    const rows = await previewSamplesCsv(
      'code,client_nit,matrix_code,plan_code,sampling_point,sampled_at\nAG0346,900123456,AG,P-1,Punto 1,2099-10-16T10:00:00-05:00',
      clients,
      matrices,
      '^AG[0-9]{4}$',
    )
    expect(rows[0].issues.every((issue) => issue.severity === 'warning')).toBe(true)
    expect(rows[0].input.sampled_at).toBe('2099-10-16T10:00:00-05:00')
  })
})
