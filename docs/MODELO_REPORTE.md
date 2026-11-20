# Modelo del reporte RSA (`buildReportModel`)

`src/lib/report/buildReportModel.ts` arma la estructura completa del "REPORTE DE RESULTADOS" (formato SA-OP-LAA-TEC-FOR.6.1) a partir de datos ya confirmados. Es una función pura, sin librería de PDF, y la consumirán la vista imprimible y el generador en servidor (A02). El caso de referencia es el RSA 0106-2026, muestra AG0346.

## Entrada y salida

La **entrada** (`ReportModelInput`) no depende de Supabase. Quien llama mapea las filas de la base de datos: reporte, plantilla versionada, cliente, contacto, muestras, resultados confirmados (con su laboratorio y sus notas) y columnas normativas con sus límites por `test_id`.

La **salida** (`ReportModel`) contiene:

| Bloque | Contenido |
|---|---|
| `header` | Título, código y versión de la plantilla, fecha de aprobación, número RSA y si es borrador |
| `client` | Cliente, contacto, teléfono, email, dirección, ciudad y NIT |
| `sampleInfo` | Fecha de reporte, periodo de análisis, recepción, muestreo, plan, lugar, tipo de muestreo, tipo de muestra, coordenadas y número de muestras |
| `sampleColumns` | Una columna por muestra (código y punto) |
| `regulationColumns` | Columnas normativas en orden |
| `sections` | Filas numeradas, agrupadas por `groupLabel` consecutivo (BTEX, HAP'S). Cada fila lleva acreditación (A, *, SAn), método, técnica, LCM, unidad, resultado e incertidumbre por muestra, y un límite por columna normativa |
| `legend` | Códigos de acreditación usados, con su laboratorio y resolución |
| `observations` | Observaciones y desviaciones de los laboratorios, con los parámetros a los que aplican |
| `issues` | Problemas encontrados. Los `BLOCKING` impiden emitir (`canIssueReport`) |

## Reglas

- **No se convierte, no se redondea y no se normaliza.** El resultado se muestra como texto original (`< 0,040`). Si hay una corrección registrada con motivo (`reportedText`), se usa esa. La incertidumbre se muestra tal como la reporta el laboratorio: absoluta en Chemilab y porcentual en AGQ e IHA.
- **El código SAn es fijo por laboratorio** y viene del catálogo (Chemilab=SA1, AGQ=SA2, IHA=SA3). Nunca se deduce del orden de aparición: en el RSA 0106-2026, AGQ aparece primero en la tabla y aun así es SA2. Los ensayos propios llevan `A` si son acreditados y `*` si no.
- **Periodo de análisis:** va del inicio más temprano al fin más tardío entre todos los resultados, en fecha calendario de Colombia (America/Bogota).
- **Límites:** un valor especial ("Análisis y Reporte", "N.A") se muestra tal cual. Un límite numérico se muestra con coma decimal y sin redondear.
- **Observaciones:** se trasladan las notas del laboratorio guardadas al importar, menos las técnicas (página del PDF, marca y sección) y el aviso de precisión.

## Validaciones (`issues`)

| Código | Severidad | Caso |
|---|---|---|
| `TEST_DATA_INCOMPLETE` | BLOCKING | El ensayo no tiene método, unidad o LCM (como el "FALTA INFO" de AOX en ListaEnsayos) |
| `UNIT_MISMATCH` | BLOCKING | La unidad del resultado no coincide con la del límite. No se convierte. Al comparar, μ y µ cuentan como iguales |
| `TRUNCATED_VALUE` | BLOCKING | Un valor "0,00" de AGQ no se ha verificado. Se resuelve registrando una corrección |
| `ACCREDITATION_CODE_MISSING` | BLOCKING | Un laboratorio subcontratado no tiene código SAn, o un ensayo propio no tiene tipo de acreditación |
| `DUPLICATE_RESULT`, `RESULT_SAMPLE_MISMATCH` | BLOCKING | Hay dos resultados del mismo ensayo para una muestra, o un resultado pertenece a una muestra que no está en el reporte |
| `CLIENT_MISSING`, `SAMPLES_MISSING`, `RESULTS_MISSING` | BLOCKING | Faltan datos básicos del reporte |
| `LIMIT_MISSING`, `RESOLUTION_MISSING`, `SAMPLED_AT_MISSING` | WARNING | Falta un límite, una resolución de acreditación o la fecha de muestreo |

## Hallazgos en el caso de referencia

- **Periodo de análisis:** con los tres informes, el modelo da **2026-06-01 a 2026-07-09**. El RSA 0106-2026 impreso dice 2026-06-02, pero IHA inició la DBO₅ el 2026-06-01 (análisis inmediato, según su informe). Hay que confirmar si el RSA tenía un error o si existe una regla que excluya algún laboratorio (pendiente de definición funcional).
- **Formato del resultado:** AGQ reporta "< 4,000" para grasas y aceites, y el RSA muestra "< 4,00". El modelo no reformatea. Si el reporte debe ajustar los decimales al LCM del catálogo, es una regla de negocio por definir, y debería hacerse como corrección explícita, no en silencio.
- **Unidad del AOX:** Chemilab reporta mg/L y el RSA imprimió µg/L. El modelo usa la unidad del laboratorio y bloquea si el límite está en otra unidad.

## Pendiente para usarlo en la aplicación

- El código SAn y la resolución por laboratorio deben venir del catálogo (tarea 3, migración nueva).
- El tipo de muestreo, el tipo de muestra y las coordenadas se mapean desde `samples`, `matrices` y `sample_field_data`.
- La vista imprimible y A02 deben consumir `ReportModel` después del merge de A06, sin tocar `ReportPrintPage.tsx` antes.
