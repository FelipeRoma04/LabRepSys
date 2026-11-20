/**
 * Reconstrucción de líneas de texto a partir de los fragmentos posicionados
 * que entrega pdfjs-dist (getTextContent).
 *
 * Función pura, sin dependencias, para poder probarla sin cargar pdfjs.
 *
 * Convenciones de la salida (las usan los adaptadores):
 * - Una línea por renglón visual, de arriba hacia abajo.
 * - La posición horizontal se convierte en espacios, de modo que las columnas
 *   de una tabla quedan alineadas. Dos o más espacios separan celdas.
 * - El texto girado (marcas de agua, leyendas verticales) se descarta.
 * - Las páginas se separan con el carácter de salto de página (\f).
 */

/** Subconjunto de TextItem de pdfjs que necesitamos */
export interface PositionedTextItem {
  str: string
  /** Matriz de transformación [a, b, c, d, e, f] */
  transform: number[]
  width: number
  height: number
}

export interface PositionedPage {
  items: PositionedTextItem[]
}

/** Puntos PDF por columna de texto en la salida */
const POINTS_PER_COLUMN = 3
/** Separación mínima (en puntos) que se considera cambio de celda */
const CELL_GAP_POINTS = 6

interface Fragment {
  x: number
  y: number
  end: number
  size: number
  str: string
}

function toFragments(items: PositionedTextItem[]): Fragment[] {
  const fragments: Fragment[] = []
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue
    const [a, b, c, d, e, f] = item.transform
    // Texto girado: componentes de rotación no despreciables
    if (Math.abs(b) > 0.01 * Math.abs(a) || Math.abs(c) > 0.01 * Math.abs(d) || a <= 0) continue
    const size = Math.abs(d) || item.height || 8
    fragments.push({ x: e, y: f, end: e + item.width, size, str: item.str })
  }
  return fragments
}

function groupLines(fragments: Fragment[]): Fragment[][] {
  const sorted = [...fragments].sort((p, q) => q.y - p.y || p.x - q.x)
  const lines: { y: number; size: number; items: Fragment[] }[] = []
  for (const fragment of sorted) {
    const current = lines[lines.length - 1]
    const tolerance = Math.max(1.5, Math.min(current?.size ?? fragment.size, fragment.size) * 0.4)
    if (current && Math.abs(current.y - fragment.y) <= tolerance) {
      current.items.push(fragment)
    } else {
      lines.push({ y: fragment.y, size: fragment.size, items: [fragment] })
    }
  }
  return lines.map((line) => line.items.sort((p, q) => p.x - q.x))
}

function renderLine(items: Fragment[], originX: number): string {
  let text = ''
  let previousEnd: number | null = null
  for (const item of items) {
    const column = Math.max(0, Math.round((item.x - originX) / POINTS_PER_COLUMN))
    if (previousEnd === null) {
      text = ' '.repeat(column)
    } else {
      const gap = item.x - previousEnd
      let minimumSpaces = 0
      if (gap >= CELL_GAP_POINTS) minimumSpaces = 2
      else if (gap > item.size * 0.15 && !text.endsWith(' ') && !item.str.startsWith(' ')) minimumSpaces = 1
      const target = gap >= CELL_GAP_POINTS ? Math.max(column, text.length + minimumSpaces) : text.length + minimumSpaces
      text += ' '.repeat(Math.max(minimumSpaces, target - text.length))
    }
    text += item.str
    previousEnd = item.end
  }
  return text.replace(/\s+$/, '')
}

/** Convierte una página en líneas de texto con columnas alineadas */
export function pageToLines(page: PositionedPage): string[] {
  const fragments = toFragments(page.items)
  if (fragments.length === 0) return []
  const originX = Math.min(...fragments.map((f) => f.x))
  return groupLines(fragments).map((line) => renderLine(line, originX))
}

/** Convierte todas las páginas en un único texto; las páginas se separan con \f */
export function pagesToText(pages: PositionedPage[]): string {
  return pages.map((page) => pageToLines(page).join('\n')).join('\n\f\n')
}

/** Divide un texto producido por pagesToText en páginas (1-indexadas por posición) */
export function splitPages(text: string): string[] {
  return text.split('\f').map((page) => page.replace(/^\n/, '').replace(/\n$/, ''))
}

/** Separa una línea en celdas (dos o más espacios separan celdas) */
export function splitCells(line: string): string[] {
  return line.trim().split(/\s{2,}/).filter(Boolean)
}
