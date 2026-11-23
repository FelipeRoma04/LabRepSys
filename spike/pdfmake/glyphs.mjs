// Comprueba si cada fuente candidata tiene glifo para µ, ₅, ± y ³ (y otros usados en el RSA).
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
const require = createRequire(import.meta.url)
const fontkit = require('@foliojs-fork/fontkit')
const vfs = require('pdfmake/build/vfs_fonts.js')
const fonts = vfs.pdfMake?.vfs ?? vfs.vfs ?? vfs
const CHARS = ['µ', 'μ', '₅', '±', '³', '²', '°', '≤', '≥', 'á', 'ñ']
const candidates = [
  ['Roboto (pdfmake)', fontkit.create(Buffer.from(fonts['Roboto-Regular.ttf'], 'base64'))],
  ...['arial.ttf', 'calibri.ttf', 'times.ttf', 'segoeui.ttf', 'DejaVuSans.ttf', 'NotoSans-Regular.ttf']
    .map((name) => [name, `C:/Windows/Fonts/${name}`])
    .filter(([, path]) => existsSync(path))
    .map(([name, path]) => [name, fontkit.openSync(path)]),
]
for (const [name, font] of candidates) {
  const missing = CHARS.filter((ch) => !font.hasGlyphForCodePoint(ch.codePointAt(0)))
  console.log(`${name.padEnd(20)} faltan: ${missing.length ? missing.join(' ') : 'ninguno'}`)
}
