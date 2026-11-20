# Adaptadores de PDF de laboratorio (A01)

Leen los informes PDF de los laboratorios subcontratados y precargan **filas candidatas** en la carga de resultados (`/resultados/carga`, pestaña "Desde PDF"). El analista revisa cada fila con el PDF a la vista y la confirma; ninguna fila se confirma sola.

## Regla de oro

El adaptador **solo extrae texto**:

- El resultado se guarda tal como aparece (`"< 0,040"`, `"<10"`, `"0,00"`). Lo interpreta `parseResult` aparte.
- No convierte unidades. pdfjs entrega `μ` (U+03BC, mu griega) y el catálogo puede tener `µ` (U+00B5, signo micro). El adaptador no las unifica.
- No redondea ni normaliza la incertidumbre. Chemilab la da **absoluta** (`+/- 0,0344`); AGQ e IHA, en **porcentaje** (`±6,72%`, `9,64%`).
- Las filas salen con `mapping_status` `SUGGESTED` (si un alias coincide) o `UNMAPPED`. Nunca salen como `EXACT` ni `CONFIRMED`.
- La única conversión es la de las **fechas** de análisis a ISO `YYYY-MM-DD`, y solo desde formatos inequívocos: AGQ usa `dd/mm/aaaa` (día primero, por convención del laboratorio), Chemilab ya usa ISO e IHA usa `1-jun-26`. La pantalla las envía como `YYYY-MM-DDT00:00:00-05:00` porque `analysis_start` y `analysis_end` son `timestamptz`. Nunca se envía `dd/mm/aaaa` crudo, porque Postgres podría leerlo como mes/día.
- Sin OCR (DP-023). Un PDF escaneado, dañado o de formato desconocido degrada a captura manual sin romper la pantalla.

## Formatos soportados

| Adaptador | Detección (por contenido) | Versión conocida | Informe de referencia |
|---|---|---|---|
| `AGQ` | "INFORME DE ENSAYO" + "AGQ" + "Nº de Referencia" | `informe-ensayo-2026` (AGQ no imprime versión; es la firma de sus dos tablas) | A-26/095066: 40 filas |
| `CHEMILAB` | "Chemilab" + "FOR 04 050" | `FOR 04 050, Versión N° 15` | R 434613: 9 filas |
| `IHA` | "REPORTE DE RESULTADOS DE LABORATORIO No" + `OP-R-nn-V-nn` + "IHA" | `OP-R-24-V-14` | 135654-1: 1 fila |

### AGQ

- Tabla "RESULTADOS ANALITICOS" (Parámetro | Resultado | Unidades | Incert | CMA), con secciones y una marca opcional (`*`, `*A`). A veces la marca viene pegada al nombre (`*A Arsénico`) y se separa en `marker`. Un `-` en Incert significa que no hay incertidumbre.
- Tabla "ANEXO TECNICO": aporta método (PNT, con sus líneas de continuación), técnica y LCM (`4,000 mg/L` → `4,000`).
- El resultado y el anexo se unen por nombre **y orden**, porque "Xilenos" aparece dos veces (±18,3 % y ±13,4 %).
- Las fechas de inicio y fin de análisis son del documento y se aplican a todas las filas.
- **Advertencia conocida:** en el informe de referencia, 7 metales subcontratados vienen como `0,00` o `< 0,00` con LCM `0,00`. El PDF perdió precisión (el RSA 0106-2026 muestra, por ejemplo, Cobre 0,0048). Cada una de esas filas lleva una observación, y la extracción muestra un aviso global. **No use esos valores sin verificarlos con el informe original del subcontratado.**

### Chemilab

- Las celdas están centradas verticalmente. Cuando el nombre del parámetro ocupa varias líneas, sus fragmentos quedan arriba y abajo de la línea de datos (ítem + fecha). Se reparten de forma simétrica: cada fila toma tantos fragmentos de arriba como de abajo. Si no se puede repartir así, el adaptador no adivina: emite el aviso "filas multilínea pegadas".
- El resultado y la incertidumbre vienen en la misma celda (`0,473 +/- 0,0344`) y se separan sin cambiar el texto.
- El asterisco de acreditación (`Fósforo total*`) pasa a `marker`.
- Las "OBSERVACIONES ANALITICAS" que declaran una **desviación del método** se ligan a la fila cuando mencionan su nombre como palabra completa o su sigla entre paréntesis (`(AOX)`). En el informe de referencia aplican a AOX, Fósforo reactivo (ortofosfato), Nitratos y Nitritos. Si una desviación no se puede ligar a ninguna fila, se muestra un aviso.
- Si "Número total de muestras" es mayor que 1, la extracción pasa a captura manual: solo se soporta una columna de muestra.
- La versión del formato se lee de "FOR 04 050, Versión N° …". Si es distinta de la 15, se muestra un aviso.

### IHA

- Las celdas se asignan a las columnas del encabezado según la cercanía de sus centros. El nombre y el método pueden ocupar varias líneas (`SM 5210 B, SM 4500-O H. SM 2023,` + `Edición 24`).
- Las marcas `(A)` (acreditado) y `(*)` (análisis inmediato) salen del nombre y pasan a `marker`.
- Las fechas de inicio y fin de análisis son del documento.
- Las "OBSERVACIONES" pasan textuales a `documentObservations`. Una "NOTA" del laboratorio (por ejemplo, la autorización del cliente para analizar la DBO₅ fuera de tiempo) genera un aviso para que el analista la lea.

## Qué se guarda

| Dato | Dónde |
|---|---|
| Parámetro, unidad, resultado, incertidumbre, LCM, método, técnica, fechas | Columnas de `import_rows` (`external_*`, `analysis_start`, `analysis_end`) |
| Página de origen (`Página N del PDF`), marca, sección y observaciones de la fila | `import_rows.validation_messages` |
| Página de origen al confirmar | `results.source_page`, que se lee de `validation_messages` |
| Adaptador y versión | `result_imports.adapter_code` y `adapter_version` |
| Avisos, datos del documento, observaciones y líneas no reconocidas | `result_imports.raw_payload` |

`documentInfo` (fechas, tipo de muestra, sitio, referencia) **no incluye datos de contacto del cliente** (nombre, NIT, dirección, correo o teléfono).

## Arquitectura

```
PDF ──► pdfText.ts (pdfjs-dist, import dinámico + worker)
          └─► pdfLayout.ts: líneas con columnas (x → espacios; 2+ espacios = celda;
                             texto girado descartado; páginas separadas con \f)
      ──► pdfAdapter.ts: extractWithAdapter(text) → findAdapter → adapter.extract
          (no lanza nunca; degrada a captura manual)
      ──► ResultsLoadPage: precarga filas, muestra avisos y datos del documento
```

pdfjs-dist (Apache-2.0) se carga solo al elegir un PDF, en un chunk aparte. El worker se publica como asset (`pdf.worker.min-*.mjs`). Si el despliegue sirve los `.mjs` con un MIME que no es JavaScript, el worker no carga y la pantalla degrada a captura manual. Verifíquelo tras el despliegue.

## Límites conocidos

- Sin OCR: los PDF escaneados se capturan a mano.
- Chemilab con varias muestras en un mismo informe: captura manual.
- Las filas multilínea que no cumplen el centrado simétrico se marcan con aviso y no se adivinan.
- Si cambia el diseño de un laboratorio, el adaptador puede devolver filas parciales con `unrecognizedLines` o pasar a captura manual. En ambos casos, revise y actualice el adaptador con un nuevo fixture.

## Cómo agregar un adaptador

1. Extraiga el texto con el mismo formato que usa la aplicación: ejecute `extractPdfText(buffer, { pdfjs })` con `pdfjs-dist/legacy/build/pdf.mjs` en un script desechable fuera de `src/`. `pdftotext -layout` **no** sirve porque produce otra disposición.
2. Anonimice el texto con relleno **de la misma longitud**, para no mover las columnas: nombre, NIT, dirección, teléfonos y correos del cliente, contratos, órdenes y firmantes. Verifique con `grep` que no quede ninguno. Guárdelo en `src/lib/adapters/__fixtures__/`. **No suba el PDF original.**
3. Cree `src/lib/adapters/<laboratorio>.ts`. Implemente `canHandle` (por contenido, nunca por nombre de archivo, y con más de una señal) y `extract`, reutilizando las utilidades de `common.ts` (`positionedCells`, `distributeCenteredFragments`, conversión de fechas y `comparableName` para comparar).
4. Regístrelo con `registerAdapter(...)` e impórtelo en `src/lib/adapters/index.ts`.
5. Agregue pruebas en `adapters.test.ts` con los valores esperados del informe, un caso de versión distinta y un caso de formato no reconocido.
6. Actualice la tabla de formatos soportados de este documento.

## Pruebas

- `src/lib/pdfLayout.test.ts`: reconstrucción de líneas y columnas, texto girado y fragmentos pegados.
- `src/lib/adapters/adapters.test.ts`: los tres adaptadores contra sus fixtures anonimizados, más detección, degradación y `parseResult`.
- `src/pages/ResultsLoadPage.test.tsx`: precarga desde PDF sin confirmar nada y PDF ilegible sin romper la pantalla. `extractPdfText` se simula porque jsdom no ejecuta el worker.

En Windows, ejecute las pruebas desde una ruta con la unidad en mayúscula (`C:\Dev\LabRepSys`). Si la ruta usa `c:\`, Vitest carga dos copias de sus módulos y falla con "failed to find the current suite".
