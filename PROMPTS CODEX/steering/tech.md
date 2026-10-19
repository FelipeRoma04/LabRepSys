---
inclusion: always
---
# Stack y convenciones tecnicas

- Frontend: React + TypeScript (strict) + Vite, HashRouter, estatico para GitHub Pages (VITE_BASE_PATH).
- Backend: Supabase (PostgreSQL, Auth, Storage, RPC, Edge Functions). Sin ASP.NET, sin SQL Server, sin servidor propio.
- Cliente unico: src/lib/supabase.ts. Variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_BASE_PATH. Jamas service_role ni secretos en el frontend o el repo.
- Base de datos: snake_case; columnas estandar (id uuid, created_at, updated_at, created_by, updated_by); migraciones nuevas en supabase/migrations (nunca editar una aplicada); RLS en toda tabla, sin politicas "allow all"; vistas con security_invoker = true; funciones security definer con search_path fijo; sin hard delete.
- RPC criticas que deban auditar un intento denegado devuelven {ok:false,...} en vez de RAISE EXCEPTION.
- UI en espanol; codigo, tablas y columnas en ingles. Coma decimal solo al mostrar.
- Prohibido el paquete xlsx de npm. Preferir CSV; para Excel usar exceljs.
- Comandos: npm run dev, build, lint, test. Antes de dar una tarea por terminada deben pasar build, lint y test.
- Reglas del proyecto compartidas con otros agentes: #[[file:.github/copilot-instructions.md]]
