// Configuración propia del spike: `npm test` de la app no recoge estos archivos.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['spike/pdfmake/**/*.spike.ts'],
    environment: 'node',
  },
})
