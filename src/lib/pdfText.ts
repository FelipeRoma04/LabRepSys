/**
 * Extracción del texto de un PDF con pdfjs-dist (Apache-2.0), en el navegador.
 * Sin OCR (DP-023): si el PDF no tiene capa de texto, hasText = false.
 */
import { pagesToText, type PositionedPage } from './pdfLayout'

export interface PdfTextResult {
  /** Texto con columnas alineadas; páginas separadas con \f */
  text: string
  pageCount: number
  hasText: boolean
}

/** Subconjunto de la API de pdfjs que usamos (permite inyectar la build legacy en Node) */
export interface PdfjsLike {
  getDocument(source: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number
      getPage(pageNumber: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
      destroy?: () => Promise<void> | void
    }>
  }
}

async function loadBrowserPdfjs(): Promise<PdfjsLike> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs as unknown as PdfjsLike
}

function isPositionedItem(item: unknown): item is PositionedPage['items'][number] {
  return typeof item === 'object' && item !== null && 'str' in item && 'transform' in item
}

export async function extractPdfText(
  data: ArrayBuffer,
  options: { pdfjs?: PdfjsLike } = {},
): Promise<PdfTextResult> {
  const pdfjs = options.pdfjs ?? await loadBrowserPdfjs()
  // pdfjs desasocia el buffer que recibe: se le pasa una copia
  const document = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise
  try {
    const pages: PositionedPage[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push({ items: content.items.filter(isPositionedItem) })
    }
    const text = pagesToText(pages)
    return {
      text,
      pageCount: document.numPages,
      hasText: text.replace(/\s/g, '').length >= 20,
    }
  } finally {
    await document.destroy?.()
  }
}
