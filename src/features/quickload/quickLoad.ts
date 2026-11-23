/**
 * Carga rápida de resultados (Bloque B, tarea 5): lógica pura.
 *
 * Reemplaza el paso manual de la macro: se sueltan los PDF de una muestra, cada
 * uno se asigna a su laboratorio por el adaptador que lo reconoce (canHandle),
 * cada fila se mapea al ensayo por alias y solo se muestran las filas dudosas.
 */
import type { PdfExtractedRow } from '../../lib/pdfAdapter'
import { parseResult } from '../../lib/parseResult'
import type { ResultImportRowDraft, ResultLoadOptions } from '../../types/results'

/**
 * Nombre del laboratorio (catálogo `laboratories.name`) que corresponde a cada
 * adaptador. Se compara por nombre normalizado, no por código SAn, porque el
 * código puede cambiar entre entornos. Si no hay coincidencia única, la persona
 * elige el laboratorio.
 */
export const ADAPTER_LABORATORY_NAMES: Record<string, string[]> = {
  AGQ: ['agq', 'agq colombia'],
  CHEMILAB: ['chemilab'],
  IHA: ['iha', 'instituto de higiene ambiental', 'instituto de higiene ambiental (iha)'],
}

export type Doubt =
  | 'NO_ALIAS'
  | 'AMBIGUOUS_ALIAS'
  | 'QUALITATIVE'
  | 'LAB_OBSERVATIONS'
  | 'MISSING_DATES'
  | 'INVALID_LCM'

export const DOUBT_LABELS: Record<Doubt, string> = {
  NO_ALIAS: 'Sin alias para este laboratorio',
  AMBIGUOUS_ALIAS: 'El alias apunta a varios ensayos',
  QUALITATIVE: 'Resultado no numérico: confirme el texto',
  LAB_OBSERVATIONS: 'El laboratorio dejó observaciones',
  MISSING_DATES: 'Faltan fechas de análisis',
  INVALID_LCM: 'LCM no numérico',
}

export interface QuickRow {
  key: string
  fileKey: string
  externalParameter: string
  externalUnit: string
  externalResult: string
  uncertainty: string
  lcm: string
  method: string
  technique: string
  analysisStart: string
  analysisEnd: string
  sourcePage: number | null
  notes: string[]
  /** Ensayo sugerido por alias o elegido por la persona */
  mappedTestId: string
  mappedBy: 'ALIAS' | 'USER' | null
  doubts: Doubt[]
  /** La persona confirmó el texto de un resultado cualitativo */
  qualitativeConfirmed: boolean
  /** La persona decidió no incluir la fila */
  excluded: boolean
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Laboratorio del catálogo que corresponde al adaptador, o null si no es único */
export function detectLaboratoryId(
  adapterId: string | null,
  laboratories: ResultLoadOptions['laboratories'],
): string | null {
  if (!adapterId) return null
  const names = ADAPTER_LABORATORY_NAMES[adapterId]
  if (!names) return null
  const matches = laboratories.filter((lab) => names.includes(normalizeName(lab.name)))
  return matches.length === 1 ? matches[0].id : null
}

export interface AliasMatch {
  testId: string
  status: 'EXACT' | 'AMBIGUOUS' | 'NONE'
}

/** Ensayo por alias exacto (normalizado) del laboratorio o alias genérico (sin laboratorio) */
export function matchAlias(
  externalName: string,
  laboratoryId: string | null,
  aliases: ResultLoadOptions['aliases'],
): AliasMatch {
  const name = normalizeName(externalName)
  if (!name || !laboratoryId) return { testId: '', status: 'NONE' }
  const testIds = new Set(
    aliases
      .filter((alias) =>
        normalizeName(alias.external_name) === name &&
        (alias.laboratory_id === null || alias.laboratory_id === laboratoryId),
      )
      .map((alias) => alias.test_id),
  )
  if (testIds.size === 1) return { testId: [...testIds][0], status: 'EXACT' }
  return { testId: '', status: testIds.size > 1 ? 'AMBIGUOUS' : 'NONE' }
}

function extractedNotes(row: PdfExtractedRow): string[] {
  return [
    ...(row.sourcePage ? [`Página ${row.sourcePage} del PDF`] : []),
    ...(row.marker ? [`Marca del laboratorio: ${row.marker}`] : []),
    ...(row.section ? [`Sección del informe: ${row.section}`] : []),
    ...(row.observations ?? []),
  ]
}

function isNumericLcm(value: string): boolean {
  if (!value.trim()) return true
  const parsed = parseResult(value)
  return parsed.type === 'numeric' && !parsed.operator
}

/** Motivos por los que una fila necesita revisión humana */
export function doubtsFor(row: Pick<QuickRow,
  'externalResult' | 'lcm' | 'analysisStart' | 'analysisEnd' | 'mappedTestId'>
  & { aliasStatus: AliasMatch['status']; observations: number }): Doubt[] {
  const doubts: Doubt[] = []
  if (!row.mappedTestId) doubts.push(row.aliasStatus === 'AMBIGUOUS' ? 'AMBIGUOUS_ALIAS' : 'NO_ALIAS')
  if (parseResult(row.externalResult).pendingConfirmation) doubts.push('QUALITATIVE')
  if (row.observations > 0) doubts.push('LAB_OBSERVATIONS')
  if (!row.analysisStart || !row.analysisEnd) doubts.push('MISSING_DATES')
  if (!isNumericLcm(row.lcm)) doubts.push('INVALID_LCM')
  return doubts
}

/** Filas de un PDF con su ensayo sugerido por alias y sus motivos de duda */
export function buildQuickRows(
  fileKey: string,
  rows: PdfExtractedRow[],
  laboratoryId: string | null,
  aliases: ResultLoadOptions['aliases'],
): QuickRow[] {
  return rows.map((row, index) => {
    const match = matchAlias(row.externalParameter, laboratoryId, aliases)
    const base = {
      key: `${fileKey}:${index}`,
      fileKey,
      externalParameter: row.externalParameter,
      externalUnit: row.externalUnit ?? '',
      externalResult: row.externalResult,
      uncertainty: row.uncertaintyText ?? '',
      lcm: row.lcmText ?? '',
      method: row.methodText ?? '',
      technique: row.techniqueText ?? '',
      analysisStart: row.analysisStart ?? '',
      analysisEnd: row.analysisEnd ?? '',
      sourcePage: row.sourcePage ?? null,
      notes: extractedNotes(row),
      mappedTestId: match.testId,
      mappedBy: match.testId ? 'ALIAS' as const : null,
      qualitativeConfirmed: false,
      excluded: false,
    }
    return {
      ...base,
      doubts: doubtsFor({ ...base, aliasStatus: match.status, observations: row.observations?.length ?? 0 }),
    }
  })
}

/** Vuelve a mapear las filas cuando cambia el laboratorio del PDF */
export function remapRows(
  rows: QuickRow[],
  laboratoryId: string | null,
  aliases: ResultLoadOptions['aliases'],
): QuickRow[] {
  return rows.map((row) => {
    if (row.mappedBy === 'USER') return row
    const match = matchAlias(row.externalParameter, laboratoryId, aliases)
    const mappedTestId = match.testId
    return {
      ...row,
      mappedTestId,
      mappedBy: mappedTestId ? 'ALIAS' : null,
      doubts: [
        ...(mappedTestId ? [] : [match.status === 'AMBIGUOUS' ? 'AMBIGUOUS_ALIAS' as const : 'NO_ALIAS' as const]),
        ...row.doubts.filter((doubt) => doubt !== 'NO_ALIAS' && doubt !== 'AMBIGUOUS_ALIAS'),
      ],
    }
  })
}

export function isDoubtful(row: QuickRow): boolean {
  return row.doubts.length > 0
}

/** Lista para guardar: excluida, o con ensayo y (si es cualitativa) texto confirmado */
export function isRowReady(row: QuickRow): boolean {
  if (row.excluded) return true
  if (!row.mappedTestId) return false
  return !row.doubts.includes('QUALITATIVE') || row.qualitativeConfirmed
}

/** Fecha ISO del laboratorio → timestamptz explícito en hora de Colombia (UTC-5) */
function isoDateToTimestamp(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00-05:00` : null
}

export function toImportDraft(row: QuickRow): ResultImportRowDraft {
  const lcm = row.lcm.trim() ? parseResult(row.lcm) : null
  return {
    external_parameter: row.externalParameter.trim(),
    external_unit: row.externalUnit.trim() || null,
    external_result: row.externalResult,
    external_uncertainty: row.uncertainty || null,
    external_lcm: lcm && lcm.type === 'numeric' && !lcm.operator ? lcm.numericValue ?? null : null,
    external_method: row.method.trim() || null,
    external_technique: row.technique.trim() || null,
    analysis_start: isoDateToTimestamp(row.analysisStart),
    analysis_end: isoDateToTimestamp(row.analysisEnd),
    mapped_test_id: row.mappedTestId || null,
    mapping_status: row.mappedBy === 'ALIAS' ? 'EXACT' : row.mappedTestId ? 'SUGGESTED' : 'UNMAPPED',
    validation_messages: [
      ...row.notes,
      ...(row.lcm.trim() && !isNumericLcm(row.lcm) ? [`LCM original no numérico: ${row.lcm}`] : []),
    ],
  }
}

/** Datos con que se confirma una fila guardada (igual que la carga clásica) */
export function confirmationPayload(row: QuickRow): Record<string, unknown> {
  const parsed = parseResult(row.externalResult)
  return {
    operator: parsed.type === 'numeric' ? parsed.operator ?? null : null,
    numeric_value: parsed.type === 'numeric' ? parsed.numericValue ?? null : null,
    source_page: row.sourcePage,
  }
}
