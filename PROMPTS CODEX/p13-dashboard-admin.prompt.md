---
description: Dashboard, auditoria, administracion, notificaciones
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa DASHBOARD REAL, INDICADORES, AUDITORÍA (pantalla), ADMINISTRACIÓN y NOTIFICACIONES internas. No agregues módulos fuera del alcance. Referencia: docs/ESPECIFICACION_v0_2.md secciones 6.12, 6.13 y 18.

DASHBOARD: eliminar las cifras demo. Consultar Supabase: muestras recibidas y pendientes; ensayos SA acreditados, SA no acreditados y subcontratados; reportes externos pendientes agrupados por laboratorio; RSA en preparación, en revisión, aprobados y emitidos; actividad reciente desde audit_logs. Filtro por periodo. Loading, empty y error. No inventes cifras cuando no hay datos.

INDICADORES: vistas SQL con security_invoker = true o RPC seguras para muestras por periodo, ensayos por clasificación, RSA emitidos, pendientes externos y tiempo por etapa solo si hay datos suficientes. El informe técnico INF queda fuera del MVP (RF-FLU-009): no lo implementes.

AUDITORÍA (solo lectura): fecha, usuario, acción, entidad, identificador, motivo y correlation_id; filtros por usuario, acción, entidad y fecha; detalle old/new solo para ADMIN, JEFE_TECNICA_CALIDAD y AUDITOR. Sin edición ni borrado.

ADMINISTRACIÓN
- Usuarios y perfiles: activar/inactivar, asignar y retirar roles (sin borrar historial).
- Consecutivos y formatos (app_settings, document_counters): ver y configurar sin afectar lo emitido.
- Almacenamiento: tipos de archivo y tamaño máximo.
- Plantillas y suplentes de aprobación (approval_deputies).
- Decisiones pendientes: tabla pending_decisions(code, topic, decision_required, suggested_owner, priority, status PENDIENTE|DEFINIDA|DESCARTADA|FUERA_DE_MVP, decision_text, decided_by, decided_at, evidence). Carga DP-001 a DP-033 desde la sección 18 de docs/ESPECIFICACION_v0_2.md. Solo ADMIN o JEFE_TECNICA_CALIDAD marcan una decisión como DEFINIDA, con responsable, fecha y evidencia. En cada módulo afectado, mostrar qué DP sigue pendiente.
- Parámetros generales y estado de integración (sin integraciones falsas).

NOTIFICACIONES INTERNAS: notifications(user_id, type, entity_type, entity_id, message, read_at, created_at). Eventos: asignación, devolución, aprobación, error de validación y reporte externo vencido (calculado al consultar, sin tareas programadas). Cada usuario ve solo las suyas. Sin correo ni Teams (DP-027).

SEGURIDAD: confirma RLS en todas las tablas nuevas.

PRUEBAS: dashboard con base vacía (estado vacío, sin cifras falsas), con datos demo, filtro de periodo, pendientes por laboratorio, auditoría con detalle restringido, cambio de rol por ADMIN y negado a otro rol, decisión DEFINIDA con evidencia, notificación de devolución. npm run build. Detente y reporta.
