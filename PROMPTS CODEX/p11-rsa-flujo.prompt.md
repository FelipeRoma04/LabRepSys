---
description: RSA: constructor, revision, aprobacion
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa BORRADORES RSA, CONSTRUCTOR, REVISIÓN, APROBACIÓN y SEGREGACIÓN (la emisión y el PDF van en el siguiente prompt). Referencia: docs/ESPECIFICACION_v0_2.md secciones 5, 6.10, RN-009, RN-012, CA-013, CA-016 y CP-012. Rutas de borradores, en revisión y aprobados.

TABLAS (migración nueva; estándar + RLS):
- reports(code nullable, version int default 1, status, client_id, contact_id, template_id, prepared_by, reviewed_by, approved_by, issued_at, replaces_report_id nullable, rectification_reason)
- report_samples(report_id, sample_id)
- report_results(report_id, result_id, display_order, group_label)
- report_regulation_columns(report_id, sample_regulation_id, column_order)
- report_reviews(report_id, reviewer_id, decision, comments, created_at)
- report_approvals(report_id, approver_id, decision, signature_reference, created_at)
- report_comments(report_id, entity_type REPORT|RESULT|FIELD, entity_id, comment, resolved, created_by, created_at)
- approval_deputies(user_id, active, valid_from, valid_until): suplentes de aprobación. SIN seed: no inventes personas (DP-013).

ESTADOS (etiquetas en español en la UI): DRAFT, VALIDATING, READY_FOR_REVIEW, IN_REVIEW, RETURNED, APPROVED, ISSUED, RECTIFIED, VOIDED. Define la tabla de transiciones válidas en SQL.

CONSTRUCTOR
- Seleccionar una o varias muestras (la regla de agrupación está pendiente, DP-003: advertir si son de distintos clientes, configurable).
- Mostrar cliente, contacto, punto, matriz, fechas, resultados, métodos, técnicas, LCM, unidad, incertidumbre, acreditación, laboratorio, normativa, límites y observaciones.
- Clasificar cada ensayo: SA acreditado, SA no acreditado o Subcontratado (con laboratorio y su acreditación).
- Plantilla: solo plantillas APROBADAS.
- Comentarios por reporte, resultado o campo.

TRANSICIONES: una sola RPC transition_report(report_id, to_status, comment). Valida: transición permitida, rol, ejecución de run_validations sin errores bloqueantes, y ausencia de reportes subcontratados pendientes antes de pasar a revisión (RN-009). La emisión parcial NO se implementa (DP-031 pendiente): bloqueo total.

SEGREGACIÓN (en la base de datos, no solo en botones)
- Quien figura en prepared_by NO puede aprobar ese reporte.
- Aprueba JEFE_TECNICA_CALIDAD o un suplente activo y vigente de approval_deputies. Si la jefa prepara el reporte, solo aprueba el suplente.
- IMPORTANTE: los intentos denegados deben auditarse. Si la RPC hace RAISE EXCEPTION, el insert de auditoría se revierte. La RPC debe registrar la auditoría del intento y DEVOLVER {ok:false, error_code, message} en lugar de lanzar excepción.
- RLS impide UPDATE directo de status y de los campos de revisión o aprobación: solo se cambian por RPC.

REVISIÓN: JEFE_TECNICA_CALIDAD acepta, devuelve con comentario (RETURNED; el analista corrige y reenvía conservando el historial) o aprueba.

PANTALLAS: borradores, en revisión, aprobados y emitidos (lista vacía hasta el siguiente prompt), detalle con historial de estados, comentarios y hallazgos.

RLS Y AUDITORÍA: ANALISTA crea y edita borradores propios; JEFE_TECNICA_CALIDAD revisa y aprueba; AUDITOR lee. Audita cada transición y cada intento denegado.

PRUEBAS: borrador, validación con bloqueantes, bloqueo por reporte externo pendiente, envío a revisión, devolución y corrección, analista intenta aprobar (denegado y auditado), preparador intenta aprobar su propio reporte, suplente aprueba, permisos. npm run build y npm test. Detente y reporta.
