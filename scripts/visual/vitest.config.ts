// Configuración propia de la comparación visual: `npm test` no la ejecuta.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['scripts/visual/**/*.compare.tsx'],
    environment: 'node',
  },
})
