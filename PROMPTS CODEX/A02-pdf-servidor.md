# A02 - Generacion de PDF en servidor (Supabase Edge Function)

Prerrequisito: Copilot ya hizo p12 (snapshot, vista imprimible, PdfService con implementacion de navegador, report_files).
Rama: feature/a02-pdf-servidor
Puede tocar: supabase/functions/render-report-pdf/**, una nueva implementacion de PdfService en src/features/reports/pdf/, documentacion.
No tocar: la vista imprimible existente (debe seguir funcionando), RPC de emision, RLS.

OBJETIVO
Generar el PDF del RSA en servidor a partir del snapshot inmutable, como pide RNF-003. La libreria final esta pendiente de aprobacion de licencia (DP-022): implementa detras de un interruptor en app_settings y no reemplaces la impresion del navegador.

REQUISITOS
- Edge Function render-report-pdf(report_id). Debe validar el JWT del usuario y comprobar el rol; leer el snapshot con el cliente del usuario (respeta RLS).
- Candidatas (licencia permisiva, verificar): pdf-lib o pdfmake. Elige la que funcione en Deno, documenta fuentes tipograficas y la decision.
- Contenido segun la seccion 9 de docs/ESPECIFICACION_v0_2.md: encabezado, plantilla/version, RSA, cliente, muestras, fechas, tabla de resultados con columnas de limites, acreditacion, subcontratados, observaciones, responsable, firma (imagen del bucket signatures), declaraciones, pie y paginacion. Repetir encabezado de tabla y no cortar filas.
- Solo reportes ISSUED o borradores con marca de agua BORRADOR. Un emitido se genera solo desde el snapshot.
- Calcular SHA-256 del PDF, guardarlo en issued-reports y registrar report_files. La service_role solo existe como secreto de la funcion, nunca en el frontend ni en el repo.
- Registrar descarga/generacion en audit_logs.

ACEPTACION
- Genera el PDF de un RSA de prueba (caso AG0346) y se compara visualmente con RSA 0106-2026. Documenta diferencias; NO afirmes fidelidad si no se probo.
- Pruebas: usuario sin rol autorizado denegado, reporte no emitido sin marca de agua rechazado, hash coincide con el archivo almacenado.
- Si falla la generacion, la pantalla muestra el error y mantiene la opcion de impresion del navegador.

ENTREGABLE: PR, supabase/functions/README.md (despliegue, secretos, limites) y docs/PDF_SERVIDOR.md.
