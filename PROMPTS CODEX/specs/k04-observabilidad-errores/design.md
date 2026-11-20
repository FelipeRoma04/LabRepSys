# Design - K04

Migracion nueva: client_error_logs(id, user_id, route, message, stack_hash, correlation_id, app_version, created_at) con RLS segun 3.3. Vista de resumen con security_invoker = true.
Frontend: ErrorBoundary global en el layout, utilidad src/lib/logging (sanitize, logClientError con limite por minuto, newCorrelationId) y un envoltorio en la capa services que agrega p_correlation_id a las RPC que lo soporten (sin cambiar sus firmas existentes: si una RPC no lo recibe, registrar solo en cliente).
Punto de extension: layout principal (ErrorBoundary) y la ruta /administracion/diagnostico. No modificar la logica de modulos.
