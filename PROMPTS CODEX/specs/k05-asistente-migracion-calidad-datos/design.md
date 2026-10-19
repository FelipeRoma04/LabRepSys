# Design - K05

Ruta /administracion/migracion con dos pestanas: Mapeo de codigos y Calidad de datos.
Migracion nueva: legacy_code_mappings(legacy_code, legacy_source, proposed_test_id, status PROPOSED|CONFIRMED|REJECTED, decided_by, decided_at, reason) con RLS (ADMIN y JEFE_TECNICA_CALIDAD escriben; AUDITOR lee). RPC confirm_legacy_mapping que crea el alias LEGACY_CODE en test_aliases, audita y, si el rol no corresponde, devuelve {ok:false} auditando el intento.
Calidad de datos: vistas SQL con security_invoker = true, una por categoria, y una RPC que las unifica. Propuestas por similitud con pg_trgm.
Punto de extension: ruta y menu de Administracion. No modificar modulos existentes; reutilizar sus servicios para los enlaces de correccion.
