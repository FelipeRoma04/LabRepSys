# Datos reales y datos de prueba

El repositorio es **público** (GitHub Pages en plan gratuito). Por eso:

| Se versiona | No se versiona nunca |
|---|---|
| Catálogos técnicos: ensayos, métodos, laboratorios, festivos | Excel de recepción, clientes y muestras reales |
| Fixtures de prueba **anonimizados** en texto (`src/lib/adapters/__fixtures__/`) | PDF originales de los laboratorios y la macro |
| Datos de demostración marcados como DEMO (`is_demo`, `demo_sample_code`) | Respaldos de la base de datos (`backups/`) |

- Guarda los archivos reales en `datos-reales/`. Está ignorada por git, igual que `*.xlsx`, `*.xlsm`, `*.xls`, `*.xlsb` y `*.pdf`.
- Para cargarlos, usa la aplicación (importación de Excel o carga de PDF): quedan en Supabase con RLS, no en el repositorio.
- Antes de subir un fixture nuevo, anonimízalo con relleno de la misma longitud y verifica con `grep` que no queden nombres, NIT, correos ni teléfonos (ver `docs/ADAPTADORES_PDF.md`).
- El CI corre Gitleaks en cada PR para detectar secretos.
