# A01 - Adaptadores de extraccion de PDF (AGQ, Chemilab, IHA)

Prerrequisito: Copilot ya hizo p07 (existen LabPdfAdapter, el registro de adaptadores, import_rows y el parseo de resultados).
Rama: feature/a01-adaptadores-pdf
Puede tocar: src/features/results/adapters/**, tests y fixtures de adaptadores.
No tocar: parseo de operadores (parseResult), migraciones, RLS, otros modulos.

OBJETIVO
Reemplazar los 3 stubs por adaptadores reales para PDF CON capa de texto. Entrada: PDF original. Salida: filas candidatas para import_rows.

REQUISITOS
- Usar pdfjs-dist (Apache-2.0) en el navegador. Sin OCR: si el PDF no tiene texto, devolver "requiere captura manual".
- Cada adaptador implementa canHandle (detecta formato y version por contenido, no por nombre de archivo) y extract.
- extract devuelve por fila: parametro externo, unidad, resultado tal como aparece (texto original), incertidumbre tal como aparece, LCM, metodo, fechas de analisis si existen, pagina de origen y observaciones/desviaciones del laboratorio.
- NUNCA interpretar, convertir unidades, redondear ni normalizar incertidumbre. El resultado va como texto original; el parseo lo hace parseResult existente.
- Nunca confirmar filas: todas salen con mapping_status SUGGESTED o UNMAPPED. El analista confirma.
- Si el formato no coincide con la version conocida, no adivinar: devolver filas parciales y la lista de lineas no reconocidas.
- Documentos de referencia: A-26_095066.pdf (AGQ), R434613 GRUPO SIERRA ALTA SAS.pdf (Chemilab), A_135654-1_GSA.pdf (IHA). El usuario los pondra en una carpeta local fuera del repo.

ACEPTACION
- Pruebas unitarias con fixtures ANONIMIZADOS (texto extraido, sin datos de clientes) por adaptador.
- Caso "< 0,040" llega como texto original, sin modificar.
- Un PDF desconocido o escaneado no rompe el flujo y degrada a captura manual.
- La interfaz muestra en cada fila la pagina de origen y el PDF al lado.
- npm run build, lint y test sin errores.

ENTREGABLE: PR con adaptadores, pruebas y docs/ADAPTADORES_PDF.md (formatos soportados, limites, como agregar uno nuevo).
