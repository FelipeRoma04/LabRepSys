/**
 * buildReportModel — arma la estructura completa del "REPORTE DE RESULTADOS"
 * (SA-OP-LAA-TEC-FOR.6.1) a partir de datos ya confirmados.
 *
 * Función pura, sin librería de PDF: la consumen la vista imprimible y el
 * generador en servidor (A02).
 *
 * Reglas de oro:
 * - No convierte unidades, no redondea, no normaliza valores ni incertidumbres.
 *   "< 0,040" queda "< 0,040". El texto corregido (reportedText) tiene prioridad.
 * - No inventa: lo que falta se reporta en `issues` (BLOCKING impide emitir).
 * - El código SAn de cada laboratorio viene del catálogo, nunca del orden de aparición.
 */
import type {
  ReportCellResult,
  ReportIssue,
  ReportLimitInput,
  ReportModel,
  ReportModelInput,
  ReportObservation,
  ReportResultInput,
  ReportRow,
  ReportSection,
} from './types'

const DEFAULT_TITLE = 'REPORTE DE RESULTADOS'
const BOGOTA_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Notas técnicas de importación que no son observaciones del laboratorio */
const TECHNICAL_NOTE = /^(Página \d+ del PDF|Marca del laboratorio:|Sección del informe:)/
/** Aviso de los adaptadores para valores "0,00" (pérdida de precisión del PDF) */
const TRUNCATED_NOTE = /pérdida de precisión/i

/** Fecha calendario en Colombia (YYYY-MM-DD) de un timestamptz o fecha ISO */
export function bogotaDate(value: string | null | undefined): string | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? BOGOTA_DATE.format(date) : null
}

function blank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === ''
}

/** Solo para COMPARAR unidades (μ griega vs µ micro, espacios); nunca para mostrar */
function comparableUnit(unit: string): string {
  return unit.replace(/μ/g, 'µ').replace(/\s+/g, '').toLowerCase()
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)]
}

/** Un solo valor si todas las muestras coinciden; si no, los distintos unidos con " / " */
function shared(values: Array<string | null | undefined>): string | null {
  const present = distinct(values.filter((value): value is string => !blank(value)))
  return present.length ? present.join(' / ') : null
}

function dateRange(values: Array<string | null>): string | null {
  const dates = values.filter((value): value is string => !!value).sort()
  if (!dates.length) return null
  return dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} a ${dates[dates.length - 1]}`
}

function displayNumber(value: number): string {
  // Sin redondear: solo coma decimal, como el resto del reporte
  return String(value).replace('.', ',')
}

function limitText(limit: ReportLimitInput | undefined): string | null {
  if (!limit) return null
  if (!blank(limit.specialValue)) return limit.specialValue!.trim()
  if (!blank(limit.text)) return limit.text!.trim()
  if (limit.value === null || limit.value === undefined) return null
  return `${limit.operator && limit.operator !== '<=' ? `${limit.operator} ` : ''}${displayNumber(limit.value)}`
}

function accreditationCodeOf(result: ReportResultInput): string | null {
  if (result.executionType === 'SUBCONTRACTED') return blank(result.laboratory.reportCode) ? null : result.laboratory.reportCode!.trim()
  if (result.accreditationType === 'ACCREDITED') return 'A'
  if (result.accreditationType === 'NOT_ACCREDITED') return '*'
  return null
}

function sortResults(results: ReportResultInput[]): ReportResultInput[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) =>
      (a.result.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.result.displayOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.index - b.index)
    .map(({ result }) => result)
}

export function buildReportModel(input: ReportModelInput): ReportModel {
  const issues: ReportIssue[] = []
  const regulations = [...(input.regulations ?? [])].sort((a, b) => a.columnOrder - b.columnOrder)
  const sampleIds = new Set(input.samples.map((sample) => sample.id))

  if (!input.client) {
    issues.push({ severity: 'BLOCKING', code: 'CLIENT_MISSING', message: 'El reporte no tiene cliente asignado.' })
  }
  if (!input.samples.length) {
    issues.push({ severity: 'BLOCKING', code: 'SAMPLES_MISSING', message: 'El reporte no incluye muestras.' })
  }
  if (!input.results.length) {
    issues.push({ severity: 'BLOCKING', code: 'RESULTS_MISSING', message: 'El reporte no incluye resultados confirmados.' })
  }
  for (const sample of input.samples) {
    if (blank(sample.sampledAt)) {
      issues.push({ severity: 'WARNING', code: 'SAMPLED_AT_MISSING', message: `La muestra ${sample.code} no tiene fecha de muestreo.` })
    }
  }

  // ── Filas: una por ensayo, con el resultado de cada muestra ───────────────
  const rowsByTest = new Map<string, { row: ReportRow; group: string | null; sources: ReportResultInput[] }>()
  const orderedTests: string[] = []
  for (const result of sortResults(input.results)) {
    if (!sampleIds.has(result.sampleId)) {
      issues.push({
        severity: 'BLOCKING',
        code: 'RESULT_SAMPLE_MISMATCH',
        message: `El resultado de "${result.parameterName}" pertenece a una muestra que no está en el reporte.`,
        testId: result.testId,
      })
      continue
    }
    let entry = rowsByTest.get(result.testId)
    if (!entry) {
      entry = {
        group: blank(result.groupLabel) ? null : result.groupLabel!.trim(),
        sources: [],
        row: {
          item: 0,
          testId: result.testId,
          testCode: result.testCode ?? null,
          parameter: result.parameterName,
          accreditationCode: accreditationCodeOf(result),
          method: blank(result.methodText) ? null : result.methodText!,
          technique: blank(result.techniqueText) ? null : result.techniqueText!,
          lcm: !blank(result.lcmText) ? result.lcmText! : result.lcm !== null && result.lcm !== undefined ? displayNumber(result.lcm) : null,
          unit: blank(result.unit) ? null : result.unit!,
          laboratory: result.laboratory.name,
          results: {},
          limits: [],
          analysisStart: null,
          analysisEnd: null,
        },
      }
      rowsByTest.set(result.testId, entry)
      orderedTests.push(result.testId)
    }
    if (entry.row.results[result.sampleId]) {
      issues.push({
        severity: 'BLOCKING',
        code: 'DUPLICATE_RESULT',
        message: `"${result.parameterName}" tiene más de un resultado para la misma muestra.`,
        testId: result.testId,
      })
      continue
    }
    const cell: ReportCellResult = {
      text: !blank(result.reportedText) ? result.reportedText! : result.originalText,
      uncertainty: blank(result.uncertaintyText) ? null : result.uncertaintyText!,
    }
    entry.row.results[result.sampleId] = cell
    entry.sources.push(result)
  }

  // ── Validaciones por fila y límites ────────────────────────────────────────
  const sections: ReportSection[] = []
  orderedTests.forEach((testId, index) => {
    const { row, group, sources } = rowsByTest.get(testId)!
    row.item = index + 1
    const starts = sources.map((source) => bogotaDate(source.analysisStart)).filter((date): date is string => !!date).sort()
    const ends = sources.map((source) => bogotaDate(source.analysisEnd ?? source.analysisStart)).filter((date): date is string => !!date).sort()
    row.analysisStart = starts[0] ?? null
    row.analysisEnd = ends[ends.length - 1] ?? null

    const missing = [
      ...(row.method ? [] : ['método']),
      ...(row.unit ? [] : ['unidad']),
      ...(row.lcm ? [] : ['LCM']),
    ]
    if (missing.length) {
      issues.push({
        severity: 'BLOCKING',
        code: 'TEST_DATA_INCOMPLETE',
        message: `"${row.parameter}" no tiene ${missing.join(', ')}. Complete el catálogo o el resultado antes de emitir.`,
        testId,
      })
    }
    if (!row.accreditationCode) {
      const source = sources[0]
      issues.push({
        severity: 'BLOCKING',
        code: 'ACCREDITATION_CODE_MISSING',
        message: source.executionType === 'SUBCONTRACTED'
          ? `El laboratorio ${source.laboratory.name} no tiene código SAn en el catálogo ("${row.parameter}").`
          : `"${row.parameter}" no tiene tipo de acreditación definido.`,
        testId,
      })
    }
    for (const source of sources) {
      const corrected = !blank(source.reportedText) && source.reportedText !== source.originalText
      if (!corrected && (source.notes ?? []).some((note) => TRUNCATED_NOTE.test(note))) {
        issues.push({
          severity: 'BLOCKING',
          code: 'TRUNCATED_VALUE',
          message: `"${row.parameter}" (${source.laboratory.name}) viene como "${source.originalText}" con posible pérdida de precisión. Registre el valor verificado como corrección antes de emitir.`,
          testId,
        })
      }
    }

    row.limits = regulations.map((column) => {
      const limit = column.limits[testId]
      const text = limitText(limit)
      if (!text) {
        issues.push({
          severity: 'WARNING',
          code: 'LIMIT_MISSING',
          message: `"${row.parameter}" no tiene límite definido en "${column.label}".`,
          testId,
        })
        return '—'
      }
      if (limit?.unit && row.unit && blank(limit.specialValue) && comparableUnit(limit.unit) !== comparableUnit(row.unit)) {
        issues.push({
          severity: 'BLOCKING',
          code: 'UNIT_MISMATCH',
          message: `"${row.parameter}": el resultado está en ${row.unit} y el límite de "${column.label}" en ${limit.unit}. No se convierte: revise antes de emitir.`,
          testId,
        })
      }
      return text
    })

    const last = sections[sections.length - 1]
    if (last && last.label === group) last.rows.push(row)
    else sections.push({ label: group, rows: [row] })
  })

  // ── Leyenda de acreditación ────────────────────────────────────────────────
  const legend: ReportModel['legend'] = []
  for (const result of input.results) {
    const code = accreditationCodeOf(result)
    if (!code || legend.some((entry) => entry.code === code)) continue
    const resolution = blank(result.laboratory.accreditationResolution) ? null : result.laboratory.accreditationResolution!.trim()
    legend.push({ code, laboratory: result.laboratory.name, resolution })
    if (code !== '*' && !resolution) {
      issues.push({
        severity: 'WARNING',
        code: 'RESOLUTION_MISSING',
        message: `El laboratorio ${result.laboratory.name} (${code}) no tiene resolución de acreditación registrada.`,
      })
    }
  }
  legend.sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }))

  // ── Observaciones y desviaciones de los laboratorios ───────────────────────
  const observations: ReportObservation[] = []
  for (const result of sortResults(input.results)) {
    for (const note of result.notes ?? []) {
      if (TECHNICAL_NOTE.test(note) || TRUNCATED_NOTE.test(note)) continue
      const existing = observations.find((item) => item.text === note && item.laboratory === result.laboratory.name)
      if (existing) {
        if (!existing.parameters.includes(result.parameterName)) existing.parameters.push(result.parameterName)
      } else {
        observations.push({ laboratory: result.laboratory.name, text: note, parameters: [result.parameterName] })
      }
    }
  }

  // ── Encabezado y bloques de información ────────────────────────────────────
  const allStarts = input.results.map((result) => bogotaDate(result.analysisStart)).filter((date): date is string => !!date).sort()
  const allEnds = input.results.map((result) => bogotaDate(result.analysisEnd ?? result.analysisStart)).filter((date): date is string => !!date).sort()
  const code = blank(input.report.code) ? null : input.report.code!.trim()

  return {
    header: {
      title: input.template.title ?? DEFAULT_TITLE,
      templateCode: input.template.code,
      templateVersion: String(input.template.version),
      approvalDate: bogotaDate(input.template.approvalDate),
      reportNumber: code,
      isDraft: !code || !input.report.issuedAt,
    },
    client: {
      businessName: input.client?.businessName ?? null,
      contact: input.contact?.name ?? null,
      phone: input.contact?.phone ?? null,
      email: input.contact?.email ?? null,
      address: input.client?.address ?? null,
      city: input.client?.city ?? null,
      nit: input.client?.nit ?? null,
    },
    sampleInfo: {
      reportDate: bogotaDate(input.report.issuedAt ?? input.report.draftDate),
      analysisPeriod: { start: allStarts[0] ?? null, end: allEnds[allEnds.length - 1] ?? null },
      receivedAt: dateRange(input.samples.map((sample) => bogotaDate(sample.receivedAt))),
      sampledAt: dateRange(input.samples.map((sample) => bogotaDate(sample.sampledAt))),
      planCode: shared(input.samples.map((sample) => sample.planCode)),
      samplingPlace: shared(input.samples.map((sample) => sample.samplingPlace)),
      samplingType: shared(input.samples.map((sample) => sample.samplingType)),
      sampleType: shared(input.samples.map((sample) => sample.sampleType)),
      latitude: shared(input.samples.map((sample) => sample.latitude)),
      longitude: shared(input.samples.map((sample) => sample.longitude)),
      sampleCount: input.samples.length,
    },
    sampleColumns: input.samples.map((sample) => ({
      sampleId: sample.id,
      code: sample.code,
      point: blank(sample.samplingPoint) ? null : sample.samplingPoint!,
    })),
    regulationColumns: regulations.map(({ columnOrder, label }) => ({ columnOrder, label })),
    sections,
    legend,
    observations,
    issues,
  }
}

/** true si el modelo no tiene problemas que impidan emitir */
export function canIssueReport(model: ReportModel): boolean {
  return !model.issues.some((issue) => issue.severity === 'BLOCKING')
}
