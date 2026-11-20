# Seeds de catálogos técnicos

Estos archivos contienen exclusivamente catálogos técnicos publicables; no contienen nombres de clientes, muestras reales ni documentos originales.

## Orden de aplicación

Después de aplicar todas las migraciones y `supabase/seed.sql`, ejecuta:

1. `01_catalogs.sql`: laboratorios, matrices y métodos.
2. `02_tests_aliases.sql`: ensayos SA vigentes y alias verificables.
3. `03_holidays_co_2026_2027.sql`: festivos nacionales de Colombia 2026–2027.

El orden también está configurado en `supabase/config.toml` para `supabase db reset` local. `supabase db push` no ejecuta seeds. No incluyas `supabase/seed-private/` en ningún despliegue o seed público.

## Criterios de carga

- Los laboratorios usan los códigos `SA` (Sierra Alta), `SA1` (Chemilab), `SA2` (AGQ) y `SA3` (IHA).
- Las matrices y métodos conservan los nombres de `ListaEnsayos` de la plantilla macro.
- Solo se cargan los 62 ensayos de esa hoja cuyo código ya cumple el prefijo vigente `SA`. Los códigos históricos de otros laboratorios no se convierten en códigos SA sin una equivalencia aprobada.
- Se conservan unidad, incertidumbre, técnica y observaciones de origen. El LCM se carga como número solo cuando la fuente contiene un número y su unidad está informada; valores como `N.A`, `-`, `FALTA INFO` o un LCM sin unidad quedan en las observaciones originales y no se convierten a cero.
- Los valores de acreditación de la hoja no corresponden a los valores del enum de base de datos; se preservan en observaciones y `accreditation_type` queda sin asignar.
- No se generaron alias: el cruce exacto de parámetro, matriz y unidad no produjo una equivalencia única verificable hacia un ensayo SA. Se deben añadir cuando exista un crosswalk verificable; no se infieren por parecido de nombre.
- Los inserts son idempotentes (`ON CONFLICT DO NOTHING`). Para cambios técnicos posteriores, crear una versión nueva del ensayo, no actualizar una versión histórica.

## Festivos

Se incluyen únicamente los feriados nacionales (no observancias) publicados para Colombia en:

- <https://www.timeanddate.com/holidays/colombia/2026>
- <https://www.timeanddate.com/holidays/colombia/2027>

`holidays` no tiene una columna de país; estos registros representan el calendario nacional colombiano.
