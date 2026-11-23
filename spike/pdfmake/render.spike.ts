/**
 * SPIKE (no se fusiona). Genera el RSA 0106-2026 de referencia (fixtures
 * anonimizados) con pdfmake y lo compara en estructura con el original de
 * datos-reales/ (ignorado por git). Las salidas van a datos-reales/spike-pdf/.
 *
 *   npx vitest run --config spike/pdfmake/vitest.config.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildReportModel } from '../../src/lib/report/buildReportModel'
import { referenceInput } from './referenceCase'
import { rsaDocDefinition } from './rsaDocDefinition'

const require = createRequire(import.meta.url)
const PdfPrinter = require('pdfmake')
const vfs = require('pdfmake/build/vfs_fonts.js')
const fonts = vfs.pdfMake?.vfs ?? vfs.vfs ?? vfs

const OUT = 'C:/Dev/LabRepSys/datos-reales/spike-pdf'
const ORIGINAL = 'C:/Dev/LabRepSys/datos-reales/RSA 0106-2026 SA-OP-LAA-TEC-FOR.6.1 REPORTE DE RESULTADOS (1).pdf'

const FONT_SETS = {
  Roboto: {
    normal: Buffer.from(fonts['Roboto-Regular.ttf'], 'base64'),
    bold: Buffer.from(fonts['Roboto-Medium.ttf'], 'base64'),
    italics: Buffer.from(fonts['Roboto-Italic.ttf'], 'base64'),
    bolditalics: Buffer.from(fonts['Roboto-MediumItalic.ttf'], 'base64'),
  },
  // Solo local, para comparar con el original: licencia de Microsoft, no redistribuible
  ArialNarrow: existsSync('C:/Windows/Fonts/ARIALN.TTF') ? {
    normal: 'C:/Windows/Fonts/ARIALN.TTF',
    bold: 'C:/Windows/Fonts/ARIALNB.TTF',
    italics: 'C:/Windows/Fonts/ARIALNI.TTF',
    bolditalics: 'C:/Windows/Fonts/ARIALNBI.TTF',
  } : null,
}

function render(docDefinition: unknown, fontSet: Record<string, unknown>): Promise<Buffer> {
  const printer = new PdfPrinter(fontSet)
  const doc = printer.createPdfKitDocument(docDefinition)
  const chunks: Buffer[] = []
  return new Promise((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

async function structure(data: Uint8Array) {
  const doc = await pdfjs.getDocument({ data }).promise
  const page = await doc.getPage(1)
  const lines: string[] = []
  for (let n = 1; n <= doc.numPages; n += 1) {
    const content = await (await doc.getPage(n)).getTextContent()
    for (const item of content.items) if ('str' in item && item.str.trim()) lines.push(item.str.trim())
  }
  return { pages: doc.numPages, size: page.view.slice(2).map(Math.round), lines }
}

it('genera el RSA 0106-2026 con pdfmake y lo compara con el original', async () => {
  mkdirSync(OUT, { recursive: true })
  const model = buildReportModel(referenceInput())
  const outputs: Record<string, Awaited<ReturnType<typeof structure>>> = {}
  for (const [font, set] of Object.entries(FONT_SETS)) {
    if (!set) continue
    const pdf = await render(rsaDocDefinition(model, { font, signerName: 'Firma de prueba' }), { [font]: set })
    writeFileSync(`${OUT}/RSA-0106-pdfmake-${font}.pdf`, pdf)
    outputs[font] = await structure(new Uint8Array(pdf))
  }
  const original = existsSync(ORIGINAL) ? await structure(new Uint8Array(readFileSync(ORIGINAL))) : null

  // Solo textos de plantilla (sin cifras) presentes en el original y ausentes en la salida:
  // sirven para encontrar rótulos que faltan. Se guardan FUERA del repositorio.
  const generated = new Set(outputs.Roboto.lines.map((line) => line.toLowerCase()))
  const missingLabels = original
    ? [...new Set(original.lines)].filter((line) => !/\d/.test(line) && line.length <= 60 && !generated.has(line.toLowerCase()))
    : []
  writeFileSync(`${OUT}/comparacion.json`, JSON.stringify({
    original: original && { pages: original.pages, size: original.size, lines: original.lines.length },
    generated: Object.fromEntries(Object.entries(outputs).map(([font, out]) => [font, { pages: out.pages, size: out.size, lines: out.lines.length }])),
    missingLabels,
  }, null, 2))
}, 120_000)
