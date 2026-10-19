---
description: Fundacion: auth, roles, RLS, auditoria, consecutivos, storage
---

Lee .github/copilot-instructions.md. El proyecto base (Vite + layout + rutas) ya existe; trabaja sobre el estado ACTUAL y no lo reconstruyas. Si algo de este prompt ya existe, complétalo sin duplicarlo.

OBJETIVO: base de seguridad y datos compartidos. No implementes módulos funcionales (clientes, muestras, etc.).

1. CONVENCIONES SQL (migración nueva)
- Extensiones pgcrypto y pg_trgm.
- Función set_updated_at() y trigger reutilizable.
- No crees tablas de módulos futuros.

2. PERFILES Y ROLES
- profiles: id uuid PK references auth.users(id) on delete restrict, full_name, email, job_title, active boolean not null default false, timestamps.
- Trigger en auth.users que crea el perfil con active=false. Un ADMIN lo activa.
- roles(code PK, name, description) con estos códigos exactos: ADMIN, ADMIN_TECNICO, COMERCIAL, MUESTREO, RECEPCION, ANALISTA, JEFE_TECNICA_CALIDAD, AUDITOR. ADMIN_TECNICO gestiona despliegue y soporte y NO aprueba resultados.
- user_roles(user_id, role_code, assigned_by, created_at; PK compuesta).
- Funciones SQL (security definer, search_path fijo): current_user_is_active(), has_role(text), has_any_role(text[]).
- RLS: cada usuario lee su perfil y sus roles; solo ADMIN escribe user_roles y activa perfiles; nadie se auto-asigna roles.

3. CONFIGURACIÓN Y CONSECUTIVOS
- app_settings(key PK, value jsonb, description, updated_by, updated_at). Lectura: usuarios activos. Escritura: ADMIN.
- document_counters(counter_code, period_year, last_value; PK compuesta) y función next_counter(counter_code text, period_year int) atómica (upsert con bloqueo de fila) que devuelve el siguiente número.
- Los formatos de visualización (COT-NNNN-AAAA, RSA NNNN-AAAA, INF-NNNN-AAAA) viven en app_settings, no en el código. Reinicio anual y momento de reserva están pendientes (DP-002): déjalos configurables.

4. AUDITORÍA
- audit_logs(id, user_id, action, entity_type, entity_id, old_data jsonb, new_data jsonb, reason, correlation_id, created_at).
- Función log_audit(...) reutilizable. Sin políticas ni grants de UPDATE/DELETE para usuarios funcionales. Lectura solo ADMIN, JEFE_TECNICA_CALIDAD y AUDITOR.

5. STORAGE
- Buckets privados: source-files, report-drafts, issued-reports, signatures. Ninguno público.
- Políticas por rol y ruta. Descargas solo con signed URLs de corta duración. Documenta las políticas en supabase/README.md.

6. FRONTEND
- Conserva diseño, Sidebar, Topbar y rutas actuales; HashRouter.
- Crear o completar: AuthProvider, useAuth, ProtectedRoute (con control opcional por rol), LoginPage, AccessDeniedPage, ConfigMissingPage.
- Estados: cargando sesión (sin parpadeo de contenido protegido), autenticado, no autenticado, error de login, usuario inactivo (mensaje claro), cierre de sesión, sesión restaurada al recargar.
- Topbar: nombre, correo, rol(es) reales y cerrar sesión (reemplaza "Usuario local").
- Si faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY: pantalla que indica cuáles faltan, sin stack traces ni intentos de guardar.
- Ocultar opciones por rol en la interfaz es solo comodidad; la seguridad real es RLS/RPC.

7. SEED Y README
- supabase/seed.sql solo con roles y settings por defecto (sin usuarios ni contraseñas).
- README: crear proyecto Supabase, .env, aplicar migraciones, crear el primer ADMIN (SQL manual documentado), desactivar el registro público en Supabase Auth y crear usuarios por invitación. No toques lo de despliegue.

8. VERIFICACIÓN
- npm run build sin errores.
- Probar: login, logout, recarga, ruta protegida, usuario inactivo, falta de variables, usuario sin rol sin acceso a datos.
- Confirmar RLS activo en todas las tablas creadas y ausencia de service_role en el código.

Detente. Reporta: archivos creados y modificados, migraciones, políticas RLS, variables requeridas, pruebas, pendientes reales.
