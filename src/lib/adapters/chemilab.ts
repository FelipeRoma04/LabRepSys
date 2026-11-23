/**
 * Adaptador Chemilab — "RESULTADOS DE ANÁLISIS", formato FOR 04 050.
 *
 * Tabla: Item | Fecha de Análisis | Parámetro | Método | Técnica | LCM | Unidad | <muestra>.
 * Las celdas están centradas verticalmente: cuando el nombre del parámetro ocupa
 * varias líneas, sus fragmentos quedan arriba y abajo de la línea de datos.
 * El resultado y la incertidumbre (ABSOLUTA) vienen en la misma celda: "0,473 +/- 0,0344".
 *
 * Solo extrae texto: no interpreta, no convierte unidades, no normaliza incertidumbre.
 */
import { registerAdapter } from '../pdfAdapter'
import type { LabPdfAdapter, PdfExtractedRow, PdfExtractResult, SampleColumn } from '../pdfAdapter'
import {
  cellCenter,
  comparableName,
  distributeCenteredFragments,
  isoDate,
  lacksTextLayer,
  pagesOf,
  positionedCells,
} from './common'

const KNOWN_VERSION = '15'
const TABLE_HEADER = /Item\s{2,}.*Par[aá]metro\s{2,}M[eé]todo\s{2,}T[eé]cnica/
const DATA_LINE = /^\s*(\d{1,3})\s{2,}(\d{4}-\d{2}-\d{2})\s{2,}\S/
const TABLE_END = /^\s*(ARI:|\*|Par[aá]metro no acreditado|Observaciones:)/
const FRAGMENT_TOLERANCE = 18
const RESULT_WITH_UNCERTAINTY = /^(.*?)\s*(\+\/-|±)\s*(.+)$/

interface TableLine {
  kind: 'data' | 'fragment'
  text: string
  index: number
}

function joinName(parts: string[]): { name: string; marker?: string } {
  const joined = parts.join(' ').replace(/\s+/g, ' ').trim()
  const marked = joined.match(/^(.*?)\s*(\*+)$/)
  return marked ? { name: marked[1], marker: marked[2] } : { name: joined }
}

function wordIncluded(haystack: string, needle: string): boolean {
  if (!needle) return false
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(haystack)
}

/** Une líneas en párrafos: una línea que empieza en mayúscula abre párrafo nuevo */
function paragraphsOf(lines: string[]): string[] {
  const paragraphs: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (!paragraphs.length || /^[A-ZÁÉÍÓÚÑ]/.test(line)) paragraphs.push(line)
    else paragraphs[paragraphs.length - 1] += ` ${line}`
  }
  return paragraphs
}

function mentionsRow(paragraph: string, rowName: string): boolean {
  const text = comparableName(paragraph)
  if (wordIncluded(text, comparableName(rowName))) return true
  const acronym = rowName.match(/\(([A-Z0-9]{2,})\)/)?.[1]
  return !!acronym && paragraph.includes(`(${acronym})`)
}

const ChemilabAdapter: LabPdfAdapter = {
  id: 'CHEMILAB',
  laboratoryName: 'Chemilab',
  formatVersion: `FOR 04 050 v${KNOWN_VERSION}`,

  canHandle(textContent: string): boolean {
    return /chemilab/i.test(textContent) && /FOR 04 050/.test(textContent)
  },

  extract(textContent: string): PdfExtractResult {
    if (lacksTextLayer(textContent)) {
      return { rows: [], requiresManualCapture: true, warnings: ['El PDF no tiene capa de texto. Capture manualmente.'] }
    }
    const pages = pagesOf(textContent)
    const text = pages.flat().join('\n')
    const warnings: string[] = []
    const unrecognizedLines: string[] = []

    const detectedVersion = text.match(/FOR 04 050,\s*Versi[oó]n N[°º]\s*(\S+?)\.?(?:\s|$)/)?.[1]
    if (!detectedVersion) warnings.push('No se encontró la versión del formato FOR 04 050.')
    else if (detectedVersion.split('/')[0] !== KNOWN_VERSION) {
      warnings.push(`Versión de formato Chemilab ${detectedVersion} distinta a la conocida (${KNOWN_VERSION}). Revise cada fila con el PDF.`)
    }

    const documentInfo: Record<string, string> = {}
    const info: [string, RegExp][] = [
      ['Reporte', /^\s*R\s?(\d{5,})\s*$/m],
      ['Fecha de recepción', /Fecha Recepci[oó]n:\s+(\d{4}-\d{2}-\d{2})/],
      ['Fecha de emisión', /Fecha de Emisi[oó]n de Resultados:\s*(\d{4}-\d{2}-\d{2})/],
      ['Fecha de muestreo', /Fecha de Muestreo:\s+(\d{4}-\d{2}-\d{2})/],
      ['Muestreo a cargo de', /Muestreo a Cargo de:\s+(.+?)\s*$/m],
      ['Plan de muestreo', /Plan de muestreo:\s+(.+?)\s*$/m],
      ['Lugar de muestreo', /Lugar de Muestreo:\s+(.+?)\s*$/m],
      ['Tipo de muestreo', /Tipo de muestreo:\s+(.+?)\s*$/m],
      ['Número total de muestras', /N[uú]mero total de muestras:\s+(\d+)/],
    ]
    for (const [label, pattern] of info) {
      const value = text.match(pattern)?.[1]?.trim()
      if (value) documentInfo[label] = value
    }
    const sampleTypeBlock = text.match(/Tipo de Muestra:([\s\S]*?)(?:\n\s*\n|Reporte de Resultados|OBSERVACIONES)/)?.[1] ?? ''
    const markedTypes = [...new Set([...sampleTypeBlock.matchAll(/([A-Za-z]+)\(\s*X\s*\)/gi)].map((match) => match[1]))]
    if (markedTypes.length) documentInfo['Tipo de muestra marcado'] = markedTypes.join(', ')
    if (detectedVersion) documentInfo['Versión del formato'] = detectedVersion

    const sampleCount = Math.max(1, Number(documentInfo['Número total de muestras'] ?? '1') || 1)

    // Una lista de filas por columna de muestra (con una sola muestra, una columna)
    const columns: PdfExtractedRow[][] = Array.from({ length: sampleCount }, () => [])
    const columnLabels: string[][] = Array.from({ length: sampleCount }, () => [])
    const rows = columns[0]
    pages.forEach((lines, pageIndex) => {
      const headerIndex = lines.findIndex((line) => TABLE_HEADER.test(line))
      if (headerIndex < 0) return
      const header = lines[headerIndex]
      const parameterStart = header.search(/Par[aá]metro/)
      const parameterCenter = parameterStart + 'Parámetro'.length / 2
      // Los resultados (una celda por muestra) empiezan a la derecha de la columna «Unidad»
      const unitHeader = positionedCells(header).find((cell) => /^Unidad$/i.test(cell.text))

      const tableLines: TableLine[] = []
      let seenData = false
      for (let index = headerIndex + 1; index < lines.length; index += 1) {
        const line = lines[index]
        if (!line.trim()) continue
        if (DATA_LINE.test(line)) {
          tableLines.push({ kind: 'data', text: line, index })
          seenData = true
          continue
        }
        if (seenData && TABLE_END.test(line)) break
        const cells = positionedCells(line)
        if (cells.length === 1 && Math.abs(cellCenter(cells[0]) - parameterCenter) <= FRAGMENT_TOLERANCE) {
          tableLines.push({ kind: 'fragment', text: cells[0].text, index })
        } else if (seenData) {
          unrecognizedLines.push(line.trim())
        }
      }
      const dataLines = tableLines.filter((line) => line.kind === 'data')
      if (!dataLines.length) return

      // Etiquetas de las columnas de muestra: texto del encabezado alineado con cada resultado
      if (sampleCount > 1 && columnLabels.every((label) => !label.length)) {
        const resultCells = positionedCells(dataLines[0].text).slice(-sampleCount)
        const firstDataIndex = dataLines[0].index
        for (let index = Math.max(0, headerIndex - 3); index < firstDataIndex; index += 1) {
          for (const cell of positionedCells(lines[index])) {
            const column = resultCells.findIndex((result) =>
              Math.abs(cellCenter(result) - cellCenter(cell)) <= FRAGMENT_TOLERANCE)
            if (column >= 0 && cell.start > parameterStart) columnLabels[column].push(cell.text)
          }
        }
      }

      // Fragmentos entre filas de datos
      const gaps: string[][] = [[]]
      for (const line of tableLines) {
        if (line.kind === 'data') gaps.push([])
        else gaps[gaps.length - 1].push(line.text)
      }
      let distribution = distributeCenteredFragments(gaps.map((gap) => gap.length))
      if (!distribution) {
        warnings.push(`Página ${pageIndex + 1}: filas multilínea pegadas; no se pudo repartir el nombre de los parámetros con certeza. Verifique los nombres.`)
        distribution = dataLines.map((_, index) => ({
          above: index === 0 ? gaps[0].length : 0,
          below: gaps[index + 1].length,
        }))
      }

      dataLines.forEach((dataLine, rowIndex) => {
        const cells = positionedCells(dataLine.text)
        const [itemCell, dateCell, ...rest] = cells
        // Método, técnica, LCM, unidad + una celda de resultado por muestra (+ nombre en línea)
        const resultsRight = unitHeader ? rest.filter((cell) => cell.start > unitHeader.end).length : sampleCount
        if ((rest.length !== 4 + sampleCount && rest.length !== 5 + sampleCount) || resultsRight !== sampleCount) {
          unrecognizedLines.push(dataLine.text.trim())
          return
        }
        const inlineName = rest.length === 5 + sampleCount ? rest.shift()!.text : undefined
        const [method, technique, lcm, unit] = rest.slice(0, 4).map((cell) => cell.text)
        const resultCells = rest.slice(4).map((cell) => cell.text)
        const { above, below } = distribution![rowIndex]
        const before = gaps[rowIndex]
        const after = gaps[rowIndex + 1]
        const nameParts = [
          ...before.slice(before.length - above),
          ...(inlineName ? [inlineName] : []),
          ...after.slice(0, below),
        ]
        const { name, marker } = joinName(nameParts)
        const date = isoDate(dateCell.text)
        resultCells.forEach((resultCell, column) => {
          const withUncertainty = resultCell.match(RESULT_WITH_UNCERTAINTY)
          columns[column].push({
            externalParameter: name,
            externalResult: withUncertainty ? withUncertainty[1] : resultCell,
            uncertaintyText: withUncertainty ? `${withUncertainty[2]} ${withUncertainty[3]}` : undefined,
            externalUnit: unit,
            lcmText: lcm,
            methodText: method,
            techniqueText: technique,
            marker,
            analysisStart: date,
            analysisEnd: date,
            sourcePage: pageIndex + 1,
            observations: [],
            rawLine: `${itemCell.text} ${dataLine.text.trim().slice(itemCell.text.length).trim()}`,
          })
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
        warnings: [...warnings, 'No se encontró la tabla de resultados de Chemilab con el formato conocido. Capture manualmente.'],
      }
    }

    // Observaciones analíticas
    const documentObservations: string[] = []
    for (const lines of pages) {
      const start = lines.findIndex((line) => /OBSERVACIONES ANAL[IÍ]TICAS/.test(line))
      if (start < 0) continue
      const block: string[] = []
      for (const line of lines.slice(start + 1)) {
        if (/^\s*(Observaciones:|Resultados validos|Prohibida)/.test(line)) break
        block.push(line)
      }
      for (const paragraph of paragraphsOf(block)) {
        documentObservations.push(paragraph)
        if (!/desviaci[oó]n/i.test(paragraph)) continue
        const linked = rows.filter((row) => mentionsRow(paragraph, row.externalParameter))
        columns.flat()
          .filter((row) => mentionsRow(paragraph, row.externalParameter))
          .forEach((row) => row.observations?.push(paragraph))
        if (!linked.length) warnings.push(`Desviación declarada que no se pudo ligar a una fila: "${paragraph}"`)
      }
    }

    if (sampleCount > 1) {
      const sampleColumns: SampleColumn[] = columns.map((columnRows, index) => ({
        label: columnLabels[index].join(' ').trim() || `Muestra ${index + 1}`,
        rows: columnRows,
      }))
      return {
        rows: [],
        sampleColumns,
        requiresManualCapture: false,
        unrecognizedLines,
        detectedFormatVersion: detectedVersion,
        warnings: [...warnings, `El informe trae ${sampleCount} muestras. Use Carga rápida para asignar cada columna a su muestra.`],
        documentInfo,
        documentObservations,
      }
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

registerAdapter(ChemilabAdapter)
export { ChemilabAdapter }
