/**
 * Carga rápida: lectura de PDF y guardado de punta a punta con los servicios
 * existentes (almacenamiento del original, save_result_import,
 * confirm_result_import_row y save_report_draft).
 */
import { sha256File } from '../../lib/fieldData'
import { extractWithAdapter, type PdfExtractResult } from '../../lib/adapters'
import { extractPdfText } from '../../lib/pdfText'
import { supabase } from '../../lib/supabase'
import { saveReportDraft } from '../../services/reportBuilder'
import {
  confirmImportRow,
  findDuplicateImport,
  listImportRows,
  saveResultImport,
} from '../../services/results'
import { confirmationPayload, toImportDraft, type QuickRow } from './quickLoad'

export interface PdfReading {
  hash: string
  adapterId: string | null
  adapterName: string | null
  formatVersion: string | null
  result: PdfExtractResult
}

/** Lee un PDF y lo pasa por el adaptador que lo reconozca. Nunca lanza por formato desconocido. */
export async function readPdf(file: File): Promise<PdfReading> {
  const hash = await sha256File(file)
  try {
    const { text } = await extractPdfText(await file.arrayBuffer())
    const { adapter, result } = extractWithAdapter(text)
    return {
      hash,
      adapterId: adapter?.id ?? null,
      adapterName: adapter?.laboratoryName ?? null,
      formatVersion: adapter?.formatVersion ?? null,
      result,
    }
  } catch {
    return {
      hash,
      adapterId: null,
      adapterName: null,
      formatVersion: null,
      result: {
        rows: [],
        requiresManualCapture: true,
        warnings: ['No se pudo leer el texto del PDF (dañado, protegido o escaneado). Capture manualmente en Carga de resultados.'],
      },
    }
  }
}

export interface QuickFileToSave {
  file: File
  reading: PdfReading
  laboratoryId: string
  rows: QuickRow[]
}

/** Plantillas aprobadas y activas (si hay una sola, el borrador la usa) */
export async function listApprovedTemplates(): Promise<{ id: string; code: string; version: number }[]> {
  if (!supabase) throw new Error('Supabase no configurado.')
  const { data, error } = await supabase
    .from('report_templates')
    .select('id, code, version')
    .eq('active', true)
    .eq('status', 'APPROVED')
    .order('code')
  if (error) throw error
  return data ?? []
}

/** Guarda el nombre del laboratorio como alias del ensayo (learn_test_alias) */
export async function learnTestAlias(input: {
  testId: string
  laboratoryId: string
  externalName: string
}): Promise<{ ok: boolean; created?: boolean; message?: string }> {
  if (!supabase) throw new Error('Supabase no configurado.')
  const { data, error } = await supabase.rpc('learn_test_alias', {
    p_test_id: input.testId,
    p_laboratory_id: input.laboratoryId,
    p_external_name: input.externalName,
  })
  if (error) return { ok: false, message: error.message }
  return (data ?? { ok: false }) as { ok: boolean; created?: boolean; message?: string }
}

export async function isDuplicatePdf(sampleId: string, laboratoryId: string, hash: string): Promise<boolean> {
  return Boolean(await findDuplicateImport(sampleId, laboratoryId, hash))
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_. -]/g, '_').replace(/^\.+/, '')
  return cleaned || 'informe.pdf'
}

export interface QuickLoadOutcome {
  reportId: string
  resultIds: string[]
  importIds: string[]
}

/**
 * Guarda cada PDF (original intacto + filas), confirma las filas incluidas y
 * crea el borrador del reporte con los resultados confirmados.
 * Si algo falla a mitad, lo ya guardado queda visible en Carga de resultados.
 */
export async function generateDraft(input: {
  sampleId: string
  clientId: string | null
  templateId: string | null
  files: QuickFileToSave[]
  onProgress?: (message: string) => void
}): Promise<QuickLoadOutcome> {
  if (!supabase) throw new Error('Supabase no configurado.')
  const resultIds: string[] = []
  const importIds: string[] = []

  for (const item of input.files) {
    const included = item.rows.filter((row) => !row.excluded)
    if (!included.length) continue
    input.onProgress?.(`Guardando ${item.file.name}…`)

    const storagePath = `samples/${input.sampleId}/${crypto.randomUUID()}-${safeFileName(item.file.name)}`
    const { error: uploadError } = await supabase.storage
      .from('source-files')
      .upload(storagePath, item.file, { cacheControl: '3600', contentType: 'application/pdf', upsert: false })
    if (uploadError) throw uploadError

    const saved = await saveResultImport({
      sample_id: input.sampleId,
      laboratory_id: item.laboratoryId,
      source_type: 'PDF',
      storage_path: storagePath,
      file_name: item.file.name,
      file_hash: item.reading.hash,
      adapter_code: item.reading.adapterId,
      adapter_version: item.reading.formatVersion,
      raw_payload: {
        adapter: item.reading.adapterId,
        detected_format_version: item.reading.result.detectedFormatVersion ?? null,
        warnings: item.reading.result.warnings ?? [],
        document_info: item.reading.result.documentInfo ?? {},
        document_observations: item.reading.result.documentObservations ?? [],
        unrecognized_lines: item.reading.result.unrecognizedLines ?? [],
        extracted_rows: item.reading.result.rows.length,
        quick_load: true,
      },
    }, included.map(toImportDraft))
    importIds.push(saved.importId)

    const savedRows = await listImportRows(saved.importId)
    for (const [index, row] of included.entries()) {
      const savedRow = savedRows.find((candidate) => candidate.row_number === index + 1)
      if (!savedRow || savedRow.confirmed) continue
      input.onProgress?.(`Confirmando ${row.externalParameter}…`)
      resultIds.push(await confirmImportRow(savedRow.id, row.mappedTestId, confirmationPayload(row)))
    }
  }

  if (!resultIds.length) throw new Error('No quedó ninguna fila para el borrador.')
  input.onProgress?.('Creando el borrador del reporte…')
  const reportId = await saveReportDraft({
    reportId: null,
    clientId: input.clientId,
    contactId: null,
    templateId: input.templateId,
    sampleIds: [input.sampleId],
    resultIds,
  })
  return { reportId, resultIds, importIds }
}
