---
description: Motor de validaciones
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa el MOTOR DE VALIDACIONES. Referencia: docs/ESPECIFICACION_v0_2.md secciones 7.2 y 7.3. Ruta /validaciones.

PRINCIPIO: las validaciones críticas se ejecutan en la base de datos (funciones SQL) para que las RPC de pasar a revisión y emitir no dependan de React. El frontend solo las dispara y las muestra.

TABLAS (migración nueva; estándar + RLS):
- validation_rules(code, description, severity ERROR|WARNING|INFO, blocking boolean, entity_type, active)
- validation_runs(entity_type, entity_id, status, executed_by, executed_at)
- validation_issues(validation_run_id, rule_code, severity, field_name, message, blocking, resolved, resolution, resolved_by, resolved_at)

FUNCIÓN: run_validations(entity_type text, entity_id uuid) devuelve el id del run. Cada regla es una función SQL registrada en validation_rules, de modo que agregar reglas sea sencillo. Guarda cada ejecución y cada hallazgo.

REGLAS A IMPLEMENTAR AHORA (sobre muestras y resultados existentes)
Bloqueantes: muestra o cliente sin identificar; ensayo sin correspondencia confirmada; resultado sin unidad cuando es obligatoria; catálogo incompleto (no emitible); unidad incompatible sin conversión aprobada; normativa requerida sin confirmar; resultado sin fuente o trazabilidad; reporte subcontratado pendiente (usa sample_has_pending_external_reports); código heredado sin mapeo SA; ensayo subcontratado sin laboratorio o fuera del alcance acreditado; issues de conciliación abiertos.
Advertencias (no bloquean, requieren decisión): fechas improbables, normativa distinta a la cotización, matriz ARD/ARnD incoherente con el artículo, desviación informada por el laboratorio.
Registra desde ya, como "pendiente de entidad", las reglas de RSA para el prompt de RSA: plantilla no aprobada o sin versión, código de reporte duplicado, firma o aprobación inexistente, segregación incumplida, contenido mínimo ISO/IEC 17025 7.8.2.

RESOLUCIÓN
- Una advertencia se resuelve con comentario y queda auditada.
- Un error bloqueante NO se puede "resolver" con un comentario: solo desaparece al corregirse el dato y volver a ejecutar.

PANTALLA: hallazgos con filtros (severidad, regla, entidad, estado), enlace para ir a la entidad afectada, botón re-ejecutar e historial de ejecuciones.

RLS Y AUDITORÍA: ejecutan ANALISTA, JEFE_TECNICA_CALIDAD y ADMIN; AUDITOR lee. Las funciones son security definer con search_path fijo.

PRUEBAS: una muestra por cada regla bloqueante, advertencia no bloqueante resuelta con comentario, error bloqueante que persiste hasta corregir, re-ejecución, permisos. npm run build y npm test. Detente y reporta.
