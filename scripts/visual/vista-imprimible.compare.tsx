/**
 * Comparación visual de la vista imprimible del RSA contra el PDF original.
 *
 * Renderiza RsaSheet con el caso de referencia RSA 0106-2026 (fixtures
 * ANONIMIZADOS) y los estilos reales de la app, lo imprime a PDF con Edge
 * (Playwright, channel msedge, sin descargar navegadores) y genera imágenes de
 * cada página de la vista y del original (datos-reales/, ignorado por git).
 * Todas las salidas van a datos-reales/comparacion/: nunca entran al repo.
 *
 *   npx vitest run --config scripts/visual/vitest.config.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium, type Page } from '@playwright/test'
import { it } from 'vitest'
import { RsaSheet } from '../../src/features/rsa/RsaSheet'
import { buildReportModel } from '../../src/lib/report/buildReportModel'
import { EMPTY_TEMPLATE_CONFIG } from '../../src/types/templateConfig'
import { referenceInput } from './referenceCase'

const require = createRequire(import.meta.url)
const OUT = 'C:/Dev/LabRepSys/datos-reales/comparacion'
const ORIGINAL = 'C:/Dev/LabRepSys/datos-reales/RSA 0106-2026 SA-OP-LAA-TEC-FOR.6.1 REPORTE DE RESULTADOS (1).pdf'
const PDFJS = require.resolve('pdfjs-dist/legacy/build/pdf.min.mjs')
const PDFJS_WORKER = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')

/** Textos genéricos: la configuración real de la plantilla vive en producción */
const PLACEHOLDER_CONFIG = {
  ...EMPTY_TEMPLATE_CONFIG,
  header: { ...EMPTY_TEMPLATE_CONFIG.header, organizationName: 'Organización', laboratoryName: 'Laboratorio', templateCode: 'SA-OP-LAA-TEC-FOR.6.1' },
  texts: {
    ...EMPTY_TEMPLATE_CONFIG.texts,
    accreditationDeclaration: 'Texto de declaración de acreditación de la plantilla.',
    samplesOnlyDeclaration: 'Texto de alcance de los resultados de la plantilla.',
    footer: 'Pie de página de la plantilla.',
  },
  signature: { ...EMPTY_TEMPLATE_CONFIG.signature, signerTitle: 'Cargo del firmante' },
}

function html(): string {
  const model = buildReportModel(referenceInput())
  const body = renderToStaticMarkup(<RsaSheet model={model} signerName="Firmante de prueba" templateConfig={PLACEHOLDER_CONFIG} />)
  const css = [
    readFileSync('src/styles/app.css', 'utf8'),
    readFileSync('src/features/rsa/rsaSheet.css', 'utf8'),
  ].join('\n')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`
}

/** Dibuja cada página de un PDF en un canvas con pdfjs y guarda una imagen por página */
async function pdfToPngs(page: Page, pdf: Buffer, prefix: string): Promise<number> {
  await page.route('http://comparacion.local/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/pdf.mjs') return route.fulfill({ body: readFileSync(PDFJS), contentType: 'text/javascript' })
    if (path === '/pdf.worker.mjs') return route.fulfill({ body: readFileSync(PDFJS_WORKER), contentType: 'text/javascript' })
    if (path === '/doc.pdf') return route.fulfill({ body: pdf, contentType: 'application/pdf' })
    return route.fulfill({ body: '<!doctype html><html><body style="margin:0;background:#fff"></body></html>', contentType: 'text/html' })
  })
  await page.goto('http://comparacion.local/')
  // Se pasa como texto: Vite reescribiría el import() dinámico de una función
  const pages = await page.evaluate(`(async () => {
    const pdfjs = await import('http://comparacion.local/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = 'http://comparacion.local/pdf.worker.mjs'
    const doc = await pdfjs.getDocument({ url: 'http://comparacion.local/doc.pdf' }).promise
    for (let n = 1; n <= doc.numPages; n += 1) {
      const pdfPage = await doc.getPage(n)
      const viewport = pdfPage.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.id = 'p' + n
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.display = 'block'
      document.body.appendChild(canvas)
      await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    }
    return doc.numPages
  })()`) as number
  for (let n = 1; n <= pages; n += 1) {
    await page.locator(`#p${n}`).screenshot({ path: `${OUT}/${prefix}-p${n}.png` })
  }
  await page.unroute('http://comparacion.local/**')
  return pages
}

it('genera imágenes de la vista imprimible y del original', async () => {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge' })
  try {
    const page = await browser.newPage()
    await page.setContent(html(), { waitUntil: 'load' })
    await page.emulateMedia({ media: 'print' })
    // Mismo tamaño de página que el original (583 x 854 pt)
    const vista = await page.pdf({ width: '8.0972in', height: '11.8611in', printBackground: true, preferCSSPageSize: false })
    writeFileSync(`${OUT}/vista-imprimible.pdf`, vista)

    const render = await browser.newPage()
    const summary = {
      vista: await pdfToPngs(render, vista, 'vista'),
      original: existsSync(ORIGINAL) ? await pdfToPngs(render, readFileSync(ORIGINAL), 'original') : 0,
    }
    writeFileSync(`${OUT}/paginas.json`, JSON.stringify(summary))
  } finally {
    await browser.close()
  }
}, 180_000)
