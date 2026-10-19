---
description: Clientes, contactos y cotizaciones
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa CLIENTES, CONTACTOS y COTIZACIONES con Supabase real. Referencia: docs/ESPECIFICACION_v0_2.md sección 6.2, RN-010 y glosario (COT). No uses mocks ni dejes mensajes de "capa de datos no configurada" cuando las variables existan.

TABLAS (migración nueva; estándar + RLS):
- clients(nit, business_name, alias, address, city, active, preferred_regulation_note): el NIT no es llave técnica; id uuid interno. NIT único cuando exista.
- contacts(client_id, name, job_title, email, phone, active)
- quotes(code, client_id, contact_id, quote_date, valid_until, status DRAFT|ACTIVE|EXPIRED|CANCELLED, decision_rule text, observations, active)
- quote_tests(quote_id, test_id, matrix_id, suggested_laboratory_id, notes)
- quote_regulations(quote_id, regulation_name, article, activity, discharge_type ARD|ARnD|NA, decision_rule, regulation_version_id nullable, requires_confirmation default true)
- Constraint o trigger: el contacto debe pertenecer al cliente de la cotización.

CONSECUTIVO: code generado con next_counter('COT', año) y formato configurable en app_settings (COT-NNNN-AAAA). Único. No asumas reglas pendientes (DP-002).

CLIENTES (/clientes)
- Listar y buscar por NIT, razón social, alias o contacto; filtro activo/inactivo; crear, editar, detalle, activar/inactivar; varios contactos por cliente.
- NIT duplicado: bloquear. Similitud de razón social con pg_trgm: solo advertir y permitir continuar con confirmación.
- Sin hard delete.

COTIZACIONES (/cotizaciones)
- Listar, buscar, crear, editar, detalle, cambiar estado (etiquetas en español: Borrador, Vigente, Vencida, Cancelada).
- Formulario: información general; cliente real; contactos del cliente; fecha y vigencia; parámetros solicitados (varios ensayos del catálogo real; los no emitibles se marcan con advertencia); normativa acordada (norma, artículo, actividad, ARD/ARnD/No aplica); regla de decisión acordada como texto libre, sin interpretarla (NTC-ISO/IEC 17025 7.1.3).
- La normativa de la cotización es una SUGERENCIA para etapas posteriores, nunca una confirmación automática.
- Guardar y recargar mantiene todo. Una cotización vencida o cancelada no se puede seleccionar en recepción.

RLS Y AUDITORÍA: COMERCIAL y ADMIN crean y editan; los demás roles activos leen clientes y cotizaciones vigentes. Audita crear, editar y cambios de estado.

FRONTEND: servicios centralizados, tipos consistentes, componentes reutilizados.

PRUEBAS: crear cliente, NIT duplicado, similitud de razón social, contactos, cotización con contacto de otro cliente (debe fallar), ensayos y normativa, cambio de estado, recarga, búsqueda, permisos. npm run build. Detente y reporta.
