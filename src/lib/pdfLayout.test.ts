import { describe, expect, it } from 'vitest'
import { pageToLines, pagesToText, splitCells, splitPages, type PositionedTextItem } from './pdfLayout'

function item(str: string, x: number, y: number, options: { width?: number; size?: number; rotated?: boolean } = {}): PositionedTextItem {
  const size = options.size ?? 8
  const width = options.width ?? str.length * size * 0.5
  return {
    str,
    transform: options.rotated ? [0, size, -size, 0, x, y] : [size, 0, 0, size, x, y],
    width,
    height: size,
  }
}

describe('pdfLayout', () => {
  it('ordena de arriba hacia abajo y une fragmentos de la misma línea', () => {
    const lines = pageToLines({
      items: [
        item('segunda', 10, 680),
        item('Primera', 10, 700),
        item('línea', 40.5, 700.5),
      ],
    })
    expect(lines).toEqual(['Primera línea', 'segunda'])
  })

  it('separa celdas con dos o más espacios y conserva la alineación de columnas', () => {
    const lines = pageToLines({
      items: [
        item('Parámetro', 10, 700), item('Resultado', 200, 700),
        item('Plomo', 10, 690), item('< 0,040', 200, 690),
      ],
    })
    expect(splitCells(lines[0])).toEqual(['Parámetro', 'Resultado'])
    expect(splitCells(lines[1])).toEqual(['Plomo', '< 0,040'])
    expect(lines[0].indexOf('Resultado')).toBe(lines[1].indexOf('< 0,040'))
  })

  it('descarta el texto girado (notas verticales en el margen)', () => {
    const lines = pageToLines({
      items: [item('Dato', 10, 700), item('(#) Nota vertical', 500, 700, { rotated: true })],
    })
    expect(lines).toEqual(['Dato'])
  })

  it('no inserta espacios entre fragmentos pegados de una misma palabra', () => {
    const lines = pageToLines({ items: [item('mg O', 10, 700, { width: 16 }), item('2', 26, 700, { width: 4 }), item('/L', 30, 700, { width: 8 })] })
    expect(lines).toEqual(['mg O2/L'])
  })

  it('une páginas con salto de página y las vuelve a separar', () => {
    const text = pagesToText([{ items: [item('Uno', 10, 700)] }, { items: [] }, { items: [item('Tres', 10, 700)] }])
    expect(splitPages(text)).toEqual(['Uno', '', 'Tres'])
  })
})
