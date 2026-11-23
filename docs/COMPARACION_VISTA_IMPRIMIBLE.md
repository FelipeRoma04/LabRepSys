# Comparación visual: vista imprimible frente al RSA original

Fecha: 2026-11-23. Se comparan dos documentos:

- **Vista imprimible** (`RsaSheet` con los estilos de la app), impresa a PDF con Edge sobre el caso de referencia RSA 0106-2026. Usa los fixtures **anonimizados** y una configuración de plantilla con textos genéricos.
- **Original:** el RSA 0106-2026 generado por la macro de Excel. Está en `datos-reales/`, fuera de git.

Las imágenes y los PDF de la comparación quedan en `datos-reales/comparacion/`, también fuera de git. Este informe **no incluye datos del cliente**.

Para repetirla:

```bash
npx vitest run --config scripts/visual/vitest.config.ts
```

No descarga navegadores: usa el Edge instalado en Windows.

## Resumen

Las dos versiones tienen las mismas secciones en el mismo orden y caben en 4 páginas de 583 × 854 pt. Las diferencias son de presentación (encabezado y pie por página, fuente, tablas, leyenda, firma) y de reglas de datos. Varias de las reglas de datos dependen de decisiones pendientes.

Se corrigió en esta rama un error de la vista: la clase `visually-hidden` se usaba sin estar definida. Por eso se veían «Control del documento» y el encabezado «Acreditación» de la tabla de resultados. El mismo error dejaba visibles los títulos ocultos de las tablas en toda la app (`DataTable`).

## Diferencias de formato (corresponden a la vista)

| # | Elemento | Original | Vista imprimible | Prioridad |
|---|---|---|---|---|
| 1 | Encabezado en cada página | Logos, título, tabla de control, número de reporte, información del cliente y de la muestra, y encabezado de la tabla, **en todas las páginas** | Solo en la primera página. Desde la segunda se repite únicamente el encabezado de la tabla | Alta |
| 2 | Pie de página | En cada página: razón social, dirección y teléfono, y «Página X de Y» | No hay pie por página ni numeración. El pie de la plantilla sale una sola vez al final | Alta |
| 3 | Logos | Logo de la acreditación y logo de la empresa a la izquierda | Nombre de organización y laboratorio en texto. La plantilla admite `logoPath`, pero la vista no lo dibuja | Alta |
| 4 | Fuente | Sans serif condensada (Arial Narrow), de 7 a 8 pt | Serif (Times) del navegador, más grande | Alta |
| 5 | Altura de filas | Una línea por ensayo, en casi todas las filas | Filas de 3 a 5 líneas: el método y el nombre se parten por columnas angostas y por la fuente | Alta |
| 6 | Celdas combinadas | En grupos como BTEX, método, técnica y límites se combinan verticalmente cuando se repiten | Cada fila repite el método, la técnica y los límites | Media |
| 7 | Bloques de cliente y muestra | Dos recuadros con título en MAYÚSCULAS, sin cuadrícula interna, rótulos alineados a la derecha. La muestra va en dos subcolumnas | Tablas con cuadrícula completa, una sola columna, títulos en minúscula | Media |
| 8 | Coordenadas | Dos renglones: «Coordenadas N» y «Geográficas W» | Un renglón: «N … · W …» | Baja |
| 9 | Encabezado de resultados | Rótulos en MAYÚSCULAS. «ENSAYO» abarca también la columna de acreditación. La columna de muestra tiene dos niveles (código y punto) y la de valor máximo permisible también (rótulo y norma) | Rótulos en minúscula y un solo nivel. El código de muestra y el punto quedan apilados en una celda angosta | Media |
| 10 | Colores | Encabezados blancos con texto en negrita. Pie en naranja corporativo | Encabezados con fondo gris | Baja |
| 11 | Subíndices y superíndices | Con formato: DBO₅, mg O₂/L, mg CaCO₃/L, mg Cl⁻/L, m⁻¹ | Texto plano: «mg O2/L», «m-1». El dato llega sin formato | Media |
| 12 | Leyenda | Dos líneas centradas con los códigos en negrita: LCM, (A) con su resolución, (SA1)…(SA3) «Subcontratado acreditado N», (*), N.A, N.E, N.R y «( --- ) No especificado por la normativa» | Una línea con otro texto, sin los códigos SA ni «( --- )». La leyenda está fija en el código y no sale de la plantilla | Alta |
| 13 | Observaciones | Recuadro «OBSERVACIONES DE LABORATORIO» con viñetas «-»: referencia de métodos, «(SAn) Subcontratado acreditado n – Resolución…» y «Declaración de conformidad» | Lista con viñetas «•». Muestra el **nombre del laboratorio subcontratado** (p. ej. «(SA1) Chemilab») | Alta |
| 14 | Desviaciones del laboratorio | No aparecen en la página de observaciones del original | Se copian textuales las desviaciones declaradas por el laboratorio externo | Media: decisión de calidad |
| 15 | Firma | Imagen de la firma, nombre, cargo y número de tarjeta profesional, centrados | Línea a todo el ancho con nombre y cargo. No hay imagen ni campo de tarjeta profesional | Alta |
| 16 | Marca de agua | Logo tenue de fondo | Ninguna, salvo «BORRADOR» en borradores | Baja |
| 17 | Celdas sin límite | «N.A», «Análisis y Reporte» o «( --- )», según la norma | «—» (raya) | Media |

## Diferencias de datos y reglas (no son de diseño)

| # | Tema | Original | Vista | Depende de |
|---|---|---|---|---|
| A | Nombre del ensayo | Nombre del catálogo SA («Demanda bioquímica de oxígeno (DBO₅)», «Cromo (Cr)») | Nombre tal como lo escribe el laboratorio externo en el caso de referencia | Verificar que con datos reales se imprima el nombre del catálogo |
| B | Orden de filas | Alfabético por nombre del catálogo, con los grupos en su lugar | Orden de carga por laboratorio | Regla de orden por definir |
| C | Ensayos propios | Incluye los ensayos de SA (pH, temperatura, caudal, acidez, etc.) | El caso de referencia solo trae informes externos | Datos |
| D | Decimales | Según el LCM: «< 10,00», «375,00», «0,10» | Texto original del laboratorio: «<10», «375», «4,000000» | **Pendiente:** decimales según LCM |
| E | Período de análisis | 2026-06-02 a 2026-07-09 | 2026-06-01 a 2026-07-09 | **Pendiente:** periodo 06-01 frente a 06-02 |
| F | Espacio tras el operador | «< 10,00» | «<10», tal como viene del laboratorio | Regla de redondeo y formato (DP-010) |

## Recomendación

1. **Primero las de prioridad alta** que no dependen de decisiones: encabezado y pie en cada página (con `position: fixed` o con el PDF del servidor, según DP-022), logos, fuente condensada, altura de filas, leyenda y firma desde la configuración de la plantilla.
2. **Agregar a la plantilla** los campos que faltan: tarjeta profesional del firmante, texto de leyenda, si las observaciones muestran o no el nombre del laboratorio, y marca de agua.
3. **Llevar al área de calidad** los puntos D, E, F, 13 y 14 (ver `docs/DECISIONES_PENDIENTES.md`).
