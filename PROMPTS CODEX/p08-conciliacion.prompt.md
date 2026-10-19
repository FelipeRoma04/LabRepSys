---
description: Conciliacion e inconsistencias
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa CONCILIACIÓN e INCONSISTENCIAS. Referencia: docs/ESPECIFICACION_v0_2.md sección 7.3, CA-003, CA-004 y CP-003 a CP-007. Ruta /resultados/conciliacion.

TABLAS (migración nueva; estándar + RLS):
- reconciliation_issues(sample_id, issue_type, field_name, source_a, value_a, source_b, value_b, status OPEN|RESOLVED, entity_type, entity_id)
- reconciliation_decisions(issue_id, selected_source, selected_value, decision ACCEPT_A|ACCEPT_B|MANUAL|REQUEST_REVIEW, reason NOT NULL, decided_by, created_at)

DETECCIÓN (función SQL o servicio central; el resultado se guarda como issues):
- Fecha de muestreo o recepción distinta entre recepción y fuente externa.
- Matriz distinta (ej. ARnD vs ARD).
- Parámetro recibido y no solicitado.
- Ensayo solicitado sin resultado.
- LCM, método, técnica o unidad distintos entre catálogo y fuente externa.
- Dos resultados para el mismo ensayo.
- Desviación informada por el laboratorio.
- Código heredado (AGQ, CHEM, SGI) sin mapeo a código SA, o ensayo con campos técnicos incompletos (ej. AOX): queda bloqueado hasta resolver.
Nunca corregir ni sustituir valores en silencio.

PANTALLA
- Comparación lado a lado: Recepción | Catálogo | Fuente externa, con el archivo y la página de origen.
- Acciones: aceptar fuente A, aceptar fuente B, corregir manualmente, solicitar revisión. El motivo es obligatorio.
- Cada decisión modifica el dato afectado SOLO mediante una RPC que guarda auditoría con old/new, usuario y motivo, y registra result_corrections cuando cambia un resultado.
- Los issues sin resolver se listan por muestra y se exponen al motor de validaciones.
- Parámetros no solicitados: aceptar (agregar al alcance) o rechazar.
- Filtros por muestra, tipo y estado.

RLS Y AUDITORÍA: ANALISTA y ADMIN resuelven; JEFE_TECNICA_CALIDAD puede revisar y devolver; AUDITOR lee.

DATOS DE DEMOSTRACIÓN: crea un seed claramente marcado DEMO (columna o prefijo, nunca mezclado con datos reales) con el caso AG0346: resultado < 0,040, fecha 29/05/2026 vs 26/05/2026, matriz ARnD vs ARD, resultado duplicado, parámetro no solicitado, ensayo AOX con código heredado CHEM y campos incompletos, y un laboratorio externo pendiente.

PRUEBAS: cada tipo de inconsistencia aparece, resolver sin motivo (rechazado), resolver con motivo (queda auditoría), AOX bloqueado, nada se corrige solo, permisos. npm run build y npm test. Detente y reporta.
