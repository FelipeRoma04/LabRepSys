# Spike: PDF del RSA con pdfmake (no se fusiona)

Rama `spike/pdfmake-rsa`. Sirve como insumo para la decisión **DP-022 (librería de PDF)**. pdfmake vive en `spike/pdfmake/package.json`, fuera del `package.json` de la app.

## Qué se hizo

- Se generó el RSA 0106-2026 de referencia con pdfmake, a partir del mismo `ReportModel` que usa la vista imprimible (`buildReportModel`). Los datos son los fixtures **anonimizados** de AGQ, Chemilab e IHA, igual que en `buildReportModel.test.ts`.
- Se generaron dos variantes: **Roboto** (incluida en pdfmake, Apache-2.0) y **Arial Narrow**. Arial Narrow es la fuente del original; se usó solo en local porque tiene licencia de Microsoft y no se puede redistribuir.
- La estructura se comparó con el PDF original en `datos-reales/`, que git ignora: páginas, tamaño y rótulos sin cifras. Las salidas y la comparación quedan en `datos-reales/spike-pdf/`, fuera de git.

Para reproducirlo:

```bash
cd spike/pdfmake && npm install
cd ../.. && npx vitest run --config spike/pdfmake/vitest.config.ts
node spike/pdfmake/glyphs.mjs   # cobertura de glifos por fuente
```

## Glifos µ, ₅, ± y ³

| Fuente | µ (U+00B5) | μ griega (U+03BC) | ₅ (U+2085) | ± | ³ |
|---|---|---|---|---|---|
| Roboto (pdfmake) | sí | sí | sí | sí | sí |
| Calibri, Times New Roman, Segoe UI | sí | sí | sí | sí | sí |
| **Arial** | sí | sí | **no** | sí | sí |
| **Arial Narrow** (la del original) | sí | sí | **no** | sí | sí |

- El original sale de Excel con Acrobat PDFMaker y usa Arial Narrow, Arial Narrow Bold, Aptos Narrow y Calibri.
- El original **no usa** el carácter ₅: escribe «DBO5». Tampoco usa el signo micro µ: usa la **μ griega**, 21 veces (en «μg/L»). Los iones (Cl⁻, S²⁻) los arma con superíndice de formato, no con caracteres Unicode.
- **Consecuencia:** con Arial Narrow, un ₅ escrito como carácter sale en blanco o como rectángulo. Hay dos salidas: usar una fuente con cobertura completa, o escribir subíndices y superíndices como formato. pdfmake soporta `sub` y `sup` en las piezas de texto.

## Diferencias contra el original

**Formato (lo que el spike debe corregir si se elige pdfmake):**

1. **Rótulos con otra capitalización o redacción:** «Fecha Aprobación», «ITEM», «RESULTADOS ANALISIS DE LABORATORIO» en mayúsculas, y «Coordenadas Geográficas» en dos líneas con N y W separados.
2. **Leyenda distinta.** El original dice «(LCM) Limite de cuantificación medible.», «(*) Analiza … sin acreditación.», «( --- ) No especificado por la normativa.» y tiene un apartado «- Declaración de conformidad:». Estos textos deben salir de la configuración de la plantilla (`templateConfig.texts`), no ir fijos en el código.
3. **Firma:** el original trae nombre y cargo del firmante. El spike no recibe la configuración de firma de la plantilla.
4. **Unidades con superíndice y subíndice** (mg Cl⁻/L, S²⁻, μg/L): en el original son piezas de texto con formato. Hay que modelarlas como texto enriquecido, porque como texto plano se pierde el formato.
5. **Páginas:** el original tiene 4 y el spike 3, ambos de 583 × 854 pt. La diferencia viene sobre todo de los datos (punto siguiente), no del formato.

**Datos (no son problemas de pdfmake):**

6. **Ensayos propios del laboratorio** (pH in situ, temperatura, caudal, acidez, alcalinidad, dureza, etc.): no están en los fixtures, que solo traen informes externos. Por eso el spike tiene menos filas.
7. **Nombres de los parámetros:** el original usa el **nombre del catálogo SA** («Demanda bioquímica de oxígeno», «HAP´S (Acenafteno)»). El caso de referencia usa el nombre tal como lo escribe el laboratorio externo («DEMANDA BIOQUÍMICA DE OXÍGENO»). El reporte final debe imprimir el nombre del catálogo. Hay que confirmar que `fromRecords` lo haga con datos reales.

## Valoración para DP-022

- **A favor:** licencia MIT; el mismo `ReportModel` alimenta el PDF y la vista imprimible; las tablas con encabezado que se repite, el texto enriquecido (`sup` y `sub`) y la marca de agua BORRADOR funcionan; corre en el navegador y en Node.
- **En contra:** pesa unos 1,4 MB más 0,8 MB de fuentes, así que debe cargarse bajo demanda y nunca en el bundle principal. Además, ajustar el diseño a la plantilla de Excel requiere trabajo manual de anchos y estilos.
- **Fuente:** no se puede usar Arial Narrow por su licencia. Las alternativas libres más cercanas son **Liberation Sans Narrow** (métricamente compatible con Arial Narrow, licencia OFL) y **Roboto Condensed** (Apache-2.0). Ninguna se probó en este spike porque no están instaladas; hay que verificar en ellas los glifos ₅ y μ antes de elegir.
- **Pendiente para el área de calidad:** si el PDF del sistema debe ser idéntico al de Excel, incluida la fuente, o solo equivalente en contenido y orden.
