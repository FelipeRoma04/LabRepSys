# Design - K02

Archivos .sql con pgTAP en supabase/tests/database: 00_global_security.sql, 10_roles_access.sql, y uno por modulo (20_catalogs, 30_clients_quotes, 40_samples, ...). Utilidad comun en un archivo de ayuda para simular usuarios (set_config('request.jwt.claims', ...) y SET LOCAL ROLE authenticated) y crear usuarios de prueba por rol dentro de la transaccion con ROLLBACK al final.
Las reglas globales consultan pg_class, pg_policies, pg_proc y pg_views. Cada prueba de modulo comprueba primero si existe la tabla o funcion (to_regclass / to_regproc) y usa skip si no.
La ejecucion local de supabase test db necesita Docker; alternativa documentada: correrlas contra un proyecto de PRUEBAS enlazado, nunca contra datos reales. No tocar migraciones ni codigo de la aplicacion.
