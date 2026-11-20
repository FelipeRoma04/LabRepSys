/**
 * Adaptador AGQ Colombia — "INFORME DE ENSAYO".
 *
 * Estructura conocida (informe de 6 páginas, sin código de versión impreso):
 * - Tabla "RESULTADOS ANALITICOS": Parámetro | Resultado | Unidades | Incert | CMA,
 *   con secciones (HAPs, BTEX, Metales…) y una marca opcional a la izquierda ("*", "*A").
 * - Tabla "ANEXO TECNICO": Parámetro | PNT | Técnica | Ref. Norma. | Lim Cuantif/ Detec.
 *   El PNT continúa en las líneas siguientes.
 * Resultado y anexo se unen por nombre Y orden de aparición ("Xilenos" aparece dos veces).
 *
 * Solo extrae texto: no interpreta, no convierte unidades, no normaliza incertidumbre.
 */
import { registerAdapter } from '../pdfAdapter'
import type { LabPdfAdapter, PdfExtractedRow, PdfExtractResult } from '../pdfAdapter'
import {
  comparableName,
  dmyToIso,
  lacksTextLayer,
  looksLikeTruncatedZero,
  pagesOf,
  positionedCells,
  type PositionedCell,
} from './common'

const FORMAT_VERSION = 'informe-ensayo-2026'
const RESULTS_HEADER = /Par[aá]metro\s{2,}Resultado\s{2,}Unidades\s{2,}Incert/
const ANNEX_HEADER = /Par[aá]metro\s{2,}PNT\s{2,}T[eé]cnica/
const END_OF_TABLE = /^\s*(Emitido por|Nota\.|\(\*\) Par[aá]metro|Los resultados emitidos)/
const MARKER_ONLY = /^\*[A-Z]{0,2}$/
const MARKER_PREFIX = /^(\*[A-Z]{0,2})\s+(.+)$/
const LCM_CELL = /^([<>]?\s*\d[\d.,]*)\s*(.*)$/

export const TRUNCATED_ZERO_NOTE =
  'El PDF muestra «0,00»: posible pérdida de precisión. No use este valor sin verificarlo con el informe original del subcontratado.'

interface AnnexEntry {
  method: string
  technique?: string
  lcmText?: string
  lcmUnit?: string
}

function splitMarker(cells: PositionedCell[]): { marker?: string; cells: PositionedCell[] } {
  if (!cells.length) return { cells }
  const [first, ...rest] = cells
  if (MARKER_ONLY.test(first.text) && rest.length) return { marker: first.text, cells: rest }
  const glued = first.text.match(MARKER_PREFIX)
  if (glued) {
    const offset = first.text.length - glued[2].length
    return { marker: glued[1], cells: [{ text: glued[2], start: first.start + offset, end: first.end }, ...rest] }
  }
  return { cells }
}

function field(text: string, label: RegExp): string | undefined {
  return text.match(label)?.[1]?.trim()
}

function documentObservationsOf(firstPage: string[]): string[] {
  const start = firstPage.findIndex((line) => /OBSERVACIONES\s*\(\*\)\s*:/.test(line))
  if (start < 0) return []
  const lines: string[] = []
  for (const line of firstPage.slice(start + 1)) {
    if (END_OF_TABLE.test(line) || /^\s*Emitido por/.test(line)) break
    if (line.trim()) lines.push(line.trim())
  }
  return lines.length ? [lines.join(' ')] : []
}

const AgqAdapter: LabPdfAdapter = {
  id: 'AGQ',
  laboratoryName: 'AGQ Colombia',
  formatVersion: FORMAT_VERSION,

  canHandle(textContent: string): boolean {
    return /INFORME DE ENSAYO/.test(textContent) &&
      /\bAGQ\b/.test(textContent) &&
      /N[ºo°] de Referencia/.test(textContent)
  },

  extract(textContent: string): PdfExtractResult {
    if (lacksTextLayer(textContent)) {
      return { rows: [], requiresManualCapture: true, warnings: ['El PDF no tiene capa de texto. Capture manualmente.'] }
    }
    const pages = pagesOf(textContent)
    const warnings: string[] = []
    const unrecognizedLines: string[] = []
    const rows: PdfExtractedRow[] = []
    const annex = new Map<string, AnnexEntry[]>()
    let foundResults = false
    let foundAnnex = false

    pages.forEach((lines, pageIndex) => {
      let mode: 'none' | 'results' | 'annex' = 'none'
      let pntColumn = 0
      let section: string | undefined
      let currentAnnex: AnnexEntry | null = null

      for (const line of lines) {
        if (RESULTS_HEADER.test(line)) {
          mode = 'results'
          foundResults = true
          continue
        }
        if (ANNEX_HEADER.test(line)) {
          mode = 'annex'
          foundAnnex = true
          pntColumn = line.search(/PNT/)
          currentAnnex = null
          continue
        }
        if (END_OF_TABLE.test(line)) {
          mode = 'none'
          continue
        }
        if (mode === 'none' || !line.trim()) continue

        const { marker, cells } = splitMarker(positionedCells(line))

        if (mode === 'results') {
          if (cells.length === 5) {
            const [name, result, unit, uncertainty, cma] = cells.map((cell) => cell.text)
            const observations: string[] = []
            if (cma !== '-') observations.push(`CMA informado: ${cma}`)
            rows.push({
              externalParameter: name,
              externalResult: result,
              externalUnit: unit,
              uncertaintyText: uncertainty === '-' ? undefined : uncertainty,
              marker,
              section,
              sourcePage: pageIndex + 1,
              observations,
              rawLine: line.trim(),
            })
          } else if (cells.length === 1 && !marker) {
            section = cells[0].text
          } else {
            unrecognizedLines.push(line.trim())
          }
          continue
        }

        // Anexo técnico
        if (cells.length === 1 && !marker && cells[0].start >= pntColumn - 2) {
          if (currentAnnex) currentAnnex.method = `${currentAnnex.method} ${cells[0].text}`
          else unrecognizedLines.push(line.trim())
        } else if (cells.length === 1 && !marker) {
          currentAnnex = null // título de sección
        } else if (cells.length >= 3) {
          const lcm = cells[cells.length - 1].text.match(LCM_CELL)
          const entry: AnnexEntry = {
            method: cells[1].text,
            technique: cells.length >= 4 ? cells[2].text : undefined,
            lcmText: lcm?.[1],
            lcmUnit: lcm?.[2] || undefined,
          }
          const key = comparableName(cells[0].text)
          annex.set(key, [...(annex.get(key) ?? []), entry])
          currentAnnex = entry
        } else {
          unrecognizedLines.push(line.trim())
        }
      }
    })

    if (!foundResults) {
      return {
        rows: [],
        requiresManualCapture: true,
        unrecognizedLines,
        warnings: ['Formato AGQ no reconocido: no se encontró la tabla "RESULTADOS ANALITICOS". Capture manualmente.'],
      }
    }
    if (!foundAnnex) warnings.push('No se encontró el "ANEXO TECNICO": método, técnica y LCM quedan vacíos.')

    const text = pages.flat().join('\n')
    const analysisStart = dmyToIso(field(text, /Fecha Inicio:\s+(\d{1,2}\/\d{1,2}\/\d{4})/))
    const analysisEnd = dmyToIso(field(text, /Fecha Fin:\s+(\d{1,2}\/\d{1,2}\/\d{4})/))
    let truncated = 0

    for (const row of rows) {
      const entry = annex.get(comparableName(row.externalParameter))?.shift()
      row.analysisStart = analysisStart
      row.analysisEnd = analysisEnd
      if (entry) {
        row.methodText = entry.method
        row.techniqueText = entry.technique
        row.lcmText = entry.lcmText
        if (entry.lcmUnit && row.externalUnit && entry.lcmUnit !== row.externalUnit) {
          row.observations?.push(`Unidad del LCM en el anexo (${entry.lcmUnit}) distinta a la del resultado (${row.externalUnit}).`)
        }
      } else if (foundAnnex) {
        warnings.push(`"${row.externalParameter}" no aparece en el anexo técnico.`)
      }
      if (looksLikeTruncatedZero(row.externalResult) || looksLikeTruncatedZero(row.lcmText)) {
        row.observations?.push(TRUNCATED_ZERO_NOTE)
        truncated += 1
      }
    }
    if (truncated) {
      warnings.push(`${truncated} resultado(s) vienen como «0,00» o con LCM «0,00» (pérdida de precisión del PDF): no los use sin verificar.`)
    }
    for (const [name, leftovers] of annex) {
      if (leftovers.length) warnings.push(`El anexo técnico tiene "${name}" sin resultado correspondiente.`)
    }

    const documentInfo: Record<string, string> = {}
    const info: [string, RegExp][] = [
      ['Referencia', /N[ºo°] de Referencia:\s+(\S+)/],
      ['Tipo de muestra', /Tipo Muestra:\s+(.+?)(?:\s{2,}|$)/m],
      ['Descripción', /Descripci[oó]n\(\^\):\s+(.+?)(?:\s{2,}|$)/m],
      ['Fecha de muestreo', /Fecha Muestreo:\s+(\S+)/],
      ['Fecha de recepción', /Fecha Recepci[oó]n:\s+(\S+)/],
      ['Fecha inicio análisis', /Fecha Inicio:\s+(\S+)/],
      ['Fecha fin análisis', /Fecha Fin:\s+(\S+)/],
      ['Fecha de emisión', /FECHA EMISI[OÓ]N:\s+(\S+)/],
    ]
    for (const [label, pattern] of info) {
      const value = field(text, pattern)
      if (value) documentInfo[label] = dmyToIso(value) ?? value
    }

    return {
      rows,
      requiresManualCapture: rows.length === 0,
      unrecognizedLines,
      detectedFormatVersion: FORMAT_VERSION,
      warnings,
      documentInfo,
      documentObservations: documentObservationsOf(pages[0] ?? []),
    }
  },
}

registerAdapter(AgqAdapter)
export { AgqAdapter }
