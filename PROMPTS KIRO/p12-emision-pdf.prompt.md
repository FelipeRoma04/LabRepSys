---
description: Emision, snapshot, PDF imprimible, rectificacion
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa EMISIÓN, SNAPSHOT, PDF IMPRIMIBLE, RECTIFICACIÓN y ANULACIÓN. Referencia: docs/ESPECIFICACION_v0_2.md secciones 6.11, 9, RN-007, CA-008 a CA-011, CP-009 y CP-010.

TABLAS (migración nueva; estándar + RLS):
- report_snapshots(report_id, snapshot_data jsonb, snapshot_hash, created_at)
- report_files(report_id, file_type DRAFT_PDF|FINAL_PDF, storage_path, sha256, created_at)

EMISIÓN: RPC issue_report(report_id) TRANSACCIONAL (todo o nada, sin emisión parcial):
1. Verifica estado APPROVED, rol y segregación; si se deniega, audita el intento y devuelve {ok:false,...} sin RAISE.
2. Re-ejecuta run_validations en la base de datos: sin errores bloqueantes y sin reportes subcontratados pendientes.
3. Verifica el contenido mínimo ISO/IEC 17025 7.8.2 (RF-PDF-011): identificación única, cliente, fechas de muestreo, recepción, análisis y emisión, método, identificación de subcontratados y no acreditados, declaración de que los resultados se refieren solo a las muestras analizadas; plantilla APROBADA con versión; firma o referencia de aprobación.
4. Asigna el consecutivo con next_counter('RSA', año) y formato configurable (DP-002).
5. Crea el snapshot inmutable con: cliente, contacto, muestras, resultados, ensayos, métodos, unidades, LCM, incertidumbre, acreditación, laboratorios, normativa, límites, plantilla y responsables. snapshot_hash = sha256 del jsonb canónico (pgcrypto).
6. Cambia el estado a ISSUED y audita.
INMUTABILIDAD: triggers que impidan UPDATE y DELETE sobre snapshots, sobre report_samples y report_results de reportes emitidos, y sobre reports ISSUED salvo las transiciones a RECTIFIED o VOIDED. Un cambio posterior de catálogo no altera lo emitido.

VISTA IMPRIMIBLE (ruta imprimible del reporte)
- Borrador: datos vivos con marca de agua BORRADOR. Emitido: se renderiza SOLO desde el snapshot, sin marca.
- Contenido (sección 9 de la especificación): encabezado, código/versión/fecha de aprobación de plantilla, RSA, cliente y contacto, muestras, fechas, tabla de resultados (ítem, ensayo, acreditación, método, técnica, LCM, resultado, unidad, incertidumbre, columnas de límites), agrupaciones, notas de acreditación IDEAM, subcontratados con su laboratorio, observaciones, responsable de emisión, firma, declaraciones, pie y paginación.
- CSS de impresión: repetir el encabezado de la tabla, evitar cortar filas, numerar páginas con @page. Si el navegador no soporta algo, documenta la limitación; no afirmes fidelidad idéntica al PDF institucional sin probarla.
- Aísla un servicio PdfService con una implementación de impresión del navegador, lista para sustituirla después por una Edge Function de Supabase (generación en servidor, DP-022). No elijas librería de PDF sin aprobación de licencia.
- "Registrar PDF final": subir el PDF final al bucket issued-reports, calcular SHA-256 en el navegador y guardarlo en report_files. Descarga solo por signed URL y según rol.

FIRMA: soportar la imagen de firma desde el bucket signatures como mecanismo provisional configurable. No implementes firma digital ni electrónica (DP-012).

RECTIFICACIÓN Y ANULACIÓN
- Un emitido no se edita ni se reabre. RPC rectify_report(report_id, reason): crea una nueva versión vinculada (replaces_report_id), el original pasa a RECTIFIED y la nueva nace en DRAFT con motivo obligatorio.
- Mostrar el original sustituido y la versión vigente.
- RPC void_report(report_id, reason): solo JEFE_TECNICA_CALIDAD, con motivo.

RLS Y AUDITORÍA: audita emisión, descarga, rectificación y anulación.

PRUEBAS: emitir con pendiente externo (rechazado), emitir correcto, snapshot y hash, cambiar un método en el catálogo y reimprimir el emitido (sin cambios), intentar editar un emitido (rechazado), rectificar con y sin motivo, borrador vs emitido, subir PDF final con SHA-256, permisos. npm run build y npm test. Detente y reporta.
