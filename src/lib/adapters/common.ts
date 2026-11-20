/**
 * Utilidades compartidas por los adaptadores de PDF.
 * Solo manipulan TEXTO: no interpretan resultados, no convierten unidades
 * ni normalizan incertidumbres.
 */
import { splitPages } from '../pdfLayout'

/** Celda de una línea con su posición en caracteres */
export interface PositionedCell {
  text: string
  start: number
  end: number
}

export function positionedCells(line: string): PositionedCell[] {
  const cells: PositionedCell[] = []
  const pattern = /\S+(?: \S+)*/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(line)) !== null) {
    cells.push({ text: match[0], start: match.index, end: match.index + match[0].length })
  }
  return cells
}

export function cellCenter(cell: PositionedCell): number {
  return (cell.start + cell.end) / 2
}

/** Líneas de cada página (1-indexadas: pages[0] es la página 1) */
export function pagesOf(text: string): string[][] {
  return splitPages(text).map((page) => page.split('\n'))
}

/** true si el texto no tiene contenido aprovechable (PDF escaneado o vacío) */
export function lacksTextLayer(text: string): boolean {
  return text.replace(/[\s\f]/g, '').length < 20
}

const SPANISH_MONTHS: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', sept: '09', oct: '10', nov: '11', dic: '12',
}

function validIsoDate(year: string, month: string, day: string): string | undefined {
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return undefined
  return iso
}

/** "04/06/2026" (día/mes/año, convención AGQ) → "2026-06-04" */
export function dmyToIso(value: string | undefined): string | undefined {
  const match = value?.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/)
  return match ? validIsoDate(match[3], match[2], match[1]) : undefined
}

/** "2026-06-05" → "2026-06-05" (validada) */
export function isoDate(value: string | undefined): string | undefined {
  const match = value?.match(/^\s*(\d{4})-(\d{2})-(\d{2})\s*$/)
  return match ? validIsoDate(match[1], match[2], match[3]) : undefined
}

/** "1-jun-26" → "2026-06-01" (convención IHA, año de dos dígitos = 20xx) */
export function spanishShortDateToIso(value: string | undefined): string | undefined {
  const match = value?.match(/^\s*(\d{1,2})-([a-záéíóú]{3,4})\.?-(\d{2}|\d{4})\s*$/i)
  if (!match) return undefined
  const month = SPANISH_MONTHS[match[2].toLocaleLowerCase('es')]
  if (!month) return undefined
  const year = match[3].length === 2 ? `20${match[3]}` : match[3]
  return validIsoDate(year, month, match[1])
}

/** Normaliza un nombre solo para COMPARAR (nunca para guardar) */
export function comparableName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[*()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es')
}

/** true para valores como "0,00", "< 0,00" o "0": posible pérdida de precisión del PDF */
export function looksLikeTruncatedZero(value: string | undefined): boolean {
  return !!value && /^\s*[<>≤≥]?\s*0(?:[.,]0+)?\s*$/.test(value)
}

/**
 * Reparte las líneas sueltas (fragmentos del nombre de un parámetro en celdas
 * centradas verticalmente) entre las filas de datos.
 *
 * Supuesto: el texto de cada celda está centrado respecto a la línea de datos,
 * así que cada fila tiene tantos fragmentos arriba como abajo.
 *
 * @param gaps gaps[0] = fragmentos antes de la primera fila; gaps[i] = entre la
 *   fila i-1 y la fila i; gaps[n] = después de la última fila.
 * @returns por fila, cuántos fragmentos toma de arriba y de abajo, o null si el
 *   supuesto no se cumple (en ese caso no se adivina).
 */
export function distributeCenteredFragments(gaps: number[]): { above: number; below: number }[] | null {
  const rows = gaps.length - 1
  const result: { above: number; below: number }[] = []
  let available = gaps[0]
  for (let index = 0; index < rows; index += 1) {
    const above = available
    const below = above
    const nextGap = gaps[index + 1]
    if (below > nextGap) return null
    result.push({ above, below })
    available = nextGap - below
  }
  return result
}
