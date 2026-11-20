/**
 * Adaptador IHA (Instituto de Higiene Ambiental) — "REPORTE DE RESULTADOS DE LABORATORIO No …",
 * código de formato OP-R-24-V-14.
 *
 * Tabla: PARÁMETRO | UNIDADES | TÉCNICA ANALÍTICA | MÉTODO | LÍMITE DE CUANTIFICACIÓN |
 * RESULTADO | INCERTIDUMBRE (%). Celdas centradas verticalmente: el nombre y el método
 * pueden repartirse arriba y abajo de la línea de datos. Incertidumbre en porcentaje.
 *
 * Solo extrae texto: no interpreta, no convierte unidades, no normaliza incertidumbre.
 */
import { registerAdapter } from '../pdfAdapter'
import type { LabPdfAdapter, PdfExtractedRow, PdfExtractResult } from '../pdfAdapter'
import {
  cellCenter,
  distributeCenteredFragments,
  lacksTextLayer,
  pagesOf,
  positionedCells,
  spanishShortDateToIso,
} from './common'

const KNOWN_VERSION = 'OP-R-24-V-14'
const TABLE_HEADER = /PAR[AÁ]METRO\s{2,}UNIDADES\s{2,}.*RESULTADO/
const TABLE_END = /^\s*OBSERVACIONES/

type ColumnKey = 'parameter' | 'unit' | 'technique' | 'method' | 'lcm' | 'result' | 'uncertainty'

const HEADER_PATTERNS: [ColumnKey, RegExp][] = [
  ['parameter', /PAR[AÁ]METRO/],
  ['unit', /UNIDADES/],
  ['technique', /T[EÉ]CNICA/],
  ['method', /M[EÉ]TODO/],
  ['lcm', /L[IÍ]MITE/],
  ['result', /RESULTADO/],
  ['uncertainty', /INCERTIDUMBRE/],
]

type CellsByColumn = Partial<Record<ColumnKey, string>>

function assignColumns(line: string, columns: { key: ColumnKey; center: number }[]): CellsByColumn {
  const assigned: CellsByColumn = {}
  for (const cell of positionedCells(line)) {
    const center = cellCenter(cell)
    const nearest = columns.reduce((best, column) =>
      Math.abs(column.center - center) < Math.abs(best.center - center) ? column : best)
    assigned[nearest.key] = assigned[nearest.key] ? `${assigned[nearest.key]} ${cell.text}` : cell.text
  }
  return assigned
}

function splitMarkers(name: string): { name: string; marker?: string } {
  const match = name.match(/^(.*?)((?:\s*\((?:A|\*|N)\))+)\s*$/)
  if (!match) return { name: name.trim() }
  const markers = match[2].match(/\((?:A|\*|N)\)/g) ?? []
  return { name: match[1].trim(), marker: markers.join(' ') }
}

function headerValue(text: string, label: RegExp): string | undefined {
  return text.match(new RegExp(`${label.source}\\s+(.+?)(?:\\s{2,}|$)`, 'm'))?.[1]?.trim()
}

const IhaAdapter: LabPdfAdapter = {
  id: 'IHA',
  laboratoryName: 'Instituto de Higiene Ambiental (IHA)',
  formatVersion: KNOWN_VERSION,

  canHandle(textContent: string): boolean {
    return /REPORTE DE RESULTADOS DE LABORATORIO No/.test(textContent) &&
      /OP-R-\d+-V-\d+/.test(textContent) &&
      /\bIHA\b/.test(textContent)
  },

  extract(textContent: string): PdfExtractResult {
    if (lacksTextLayer(textContent)) {
      return { rows: [], requiresManualCapture: true, warnings: ['El PDF no tiene capa de texto. Capture manualmente.'] }
    }
    const pages = pagesOf(textContent)
    const text = pages.flat().join('\n')
    const warnings: string[] = []
    const unrecognizedLines: string[] = []

    const detectedVersion = text.match(/OP-R-\d+-V-\d+/)?.[0]
    if (detectedVersion !== KNOWN_VERSION) {
      warnings.push(`Versión de formato IHA ${detectedVersion ?? 'desconocida'} distinta a la conocida (${KNOWN_VERSION}). Revise cada fila con el PDF.`)
    }

    const analysisStart = spanishShortDateToIso(headerValue(text, /FECHA INICIO AN[AÁ]LISIS:/))
    const analysisEnd = spanishShortDateToIso(headerValue(text, /FECHA FINALIZACI[OÓ]N AN[AÁ]LISIS:/))

    const documentInfo: Record<string, string> = {}
    const reportNumber = text.match(/REPORTE DE RESULTADOS DE LABORATORIO No\s+(\S+)/)?.[1]
    if (reportNumber) documentInfo.Reporte = reportNumber
    const info: [string, RegExp, boolean][] = [
      ['Fecha de emisión', /Fecha de Emisi[oó]n:/, false],
      ['Matriz', /MATRIZ:/, false],
      ['Muestreo a cargo de', /MUESTREO A CARGO DE:/, false],
      ['Sitio de muestreo', /SITIO DE MUESTREO:/, false],
      ['Fecha de muestreo', /FECHA DE MUESTREO:/, true],
      ['Fecha de recepción', /FECHA DE RECEPCI[OÓ]N DE MUESTRAS:/, true],
      ['Fecha inicio análisis', /FECHA INICIO AN[AÁ]LISIS:/, true],
      ['Fecha fin análisis', /FECHA FINALIZACI[OÓ]N AN[AÁ]LISIS:/, true],
    ]
    for (const [label, pattern, isDate] of info) {
      const value = headerValue(text, pattern)
      if (value) documentInfo[label] = isDate ? spanishShortDateToIso(value) ?? value : value
    }
    if (detectedVersion) documentInfo['Versión del formato'] = detectedVersion

    const rows: PdfExtractedRow[] = []
    pages.forEach((lines, pageIndex) => {
      const headerIndex = lines.findIndex((line) => TABLE_HEADER.test(line))
      if (headerIndex < 0) return
      const headerCells = positionedCells(lines[headerIndex])
      const columns = HEADER_PATTERNS.flatMap(([key, pattern]) => {
        const cell = headerCells.find((candidate) => pattern.test(candidate.text))
        return cell ? [{ key, center: cellCenter(cell) }] : []
      })
      if (columns.length !== HEADER_PATTERNS.length) {
        unrecognizedLines.push(lines[headerIndex].trim())
        return
      }

      const tableLines: { anchor: boolean; cells: CellsByColumn; raw: string }[] = []
      for (const line of lines.slice(headerIndex + 1)) {
        if (TABLE_END.test(line)) break
        if (!line.trim()) continue
        const cells = assignColumns(line, columns)
        const anchor = !!(cells.unit && cells.lcm && cells.result)
        tableLines.push({ anchor, cells, raw: line.trim() })
      }
      const anchors = tableLines.filter((line) => line.anchor)
      if (!anchors.length) return

      const gaps: CellsByColumn[][] = [[]]
      for (const line of tableLines) {
        if (line.anchor) gaps.push([])
        else gaps[gaps.length - 1].push(line.cells)
      }
      let distribution = distributeCenteredFragments(gaps.map((gap) => gap.length))
      if (!distribution) {
        warnings.push(`Página ${pageIndex + 1}: filas multilínea pegadas; verifique nombres y métodos con el PDF.`)
        distribution = anchors.map((_, index) => ({
          above: index === 0 ? gaps[0].length : 0,
          below: gaps[index + 1].length,
        }))
      }

      anchors.forEach((anchor, index) => {
        const { above, below } = distribution![index]
        const before = gaps[index]
        const parts = [...before.slice(before.length - above), anchor.cells, ...gaps[index + 1].slice(0, below)]
        const join = (key: ColumnKey) => parts.map((part) => part[key]).filter(Boolean).join(' ').trim() || undefined
        const { name, marker } = splitMarkers(join('parameter') ?? '')
        rows.push({
          externalParameter: name,
          externalUnit: anchor.cells.unit,
          externalResult: anchor.cells.result ?? '',
          uncertaintyText: anchor.cells.uncertainty,
          lcmText: anchor.cells.lcm,
          methodText: join('method'),
          techniqueText: join('technique'),
          marker,
          analysisStart,
          analysisEnd,
          sourcePage: pageIndex + 1,
          observations: [],
          rawLine: anchor.raw,
        })
      })
    })

    if (!rows.length) {
      return {
        rows: [],
        requiresManualCapture: true,
        unrecognizedLines,
        detectedFormatVersion: detectedVersion,
        documentInfo,
        warnings: [...warnings, 'No se encontró la tabla de resultados de IHA con el formato conocido. Capture manualmente.'],
      }
    }

    const documentObservations: string[] = []
    for (const lines of pages) {
      const start = lines.findIndex((line) => TABLE_END.test(line))
      if (start < 0) continue
      for (const line of lines.slice(start + 1)) {
        if (/^\s*_{5,}|FIN DEL REPORTE/.test(line)) break
        const item = line.trim().replace(/^-\s*/, '')
        if (item) documentObservations.push(item)
      }
    }
    for (const note of documentObservations.filter((item) => /^NOTA\b/i.test(item))) {
      warnings.push(`El laboratorio incluye una nota que debe revisar: "${note}"`)
    }

    return {
      rows,
      requiresManualCapture: false,
      unrecognizedLines,
      detectedFormatVersion: detectedVersion,
      warnings,
      documentInfo,
      documentObservations,
    }
  },
}

registerAdapter(IhaAdapter)
export { IhaAdapter }
