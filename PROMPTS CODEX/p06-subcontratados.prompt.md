---
description: Envios y pendientes de laboratorios subcontratados
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa LABORATORIOS SUBCONTRATADOS: envíos y reportes pendientes. Referencia: docs/ESPECIFICACION_v0_2.md secciones 6.6, RN-009, CA-013 y CP-013. Reemplaza los placeholders de las rutas de laboratorios externos, envíos y reportes pendientes.

TABLAS (migración nueva; estándar + RLS):
- external_shipments(sample_id, laboratory_id, external_code, sent_at, expected_at, report_received_at, status PENDING_SEND|SENT|REPORT_RECEIVED|CANCELLED, observations)
- external_shipment_tests(shipment_id, sample_test_id)

REGLAS
- Un sample_test subcontratado debe estar en exactamente un envío activo.
- expected_at se digita manualmente. NO calcules plazos, días hábiles ni festivos (DP-014 pendiente).
- Registrar la recepción del reporte externo guarda report_received_at y el usuario.
- Un reporte pendiente es un envío con status distinto de REPORT_RECEIVED y CANCELLED.
- Crear en la base de datos: vista v_pending_external_reports (security_invoker = true) y función sample_has_pending_external_reports(sample_id uuid) boolean. Serán usadas por RSA y validaciones: no dupliques esta lógica en React.
- Al registrar un envío, advertir (sin bloquear) si el ensayo no está en el alcance acreditado vigente del laboratorio a la fecha de análisis (RF-LAB-004).
- Los laboratorios externos hoy figuran en texto libre en OBSERVACIONES: ofrece una acción manual "estructurar" que cree el envío a partir de la muestra, sin interpretar el texto automáticamente.

PANTALLAS
- Registro de envíos: muestra, laboratorio, ensayos, fecha de envío, fecha esperada, código externo, estado.
- Reportes pendientes agrupados por laboratorio con: cliente, muestra, punto de muestreo, fecha esperada, días de retraso (calculado con la fecha actual) y estado. Destacar vencidos.
- Acción "Registrar recepción de reporte" con fecha real.
- Filtros por laboratorio, cliente y vencimiento. Loading, empty y error.

RLS Y AUDITORÍA: RECEPCION, ANALISTA y ADMIN gestionan envíos; JEFE_TECNICA_CALIDAD y AUDITOR leen. Audita envío, cambio de estado y recepción.

PRUEBAS: envío con varios ensayos, ensayo duplicado en dos envíos activos (rechazado), pendiente visible por laboratorio, días de retraso, recepción de reporte que lo saca de pendientes, sample_has_pending_external_reports antes y después, advertencia de alcance, permisos. npm run build. Detente y reporta.
