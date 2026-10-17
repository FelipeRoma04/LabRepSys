# Supabase

Esta carpeta contiene la configuración inicial generada con `npx supabase init`. El proyecto apunta a Supabase alojado y no requiere Docker.

1. Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env.local`.
2. Ejecuta `npx supabase login` y `npx supabase link --project-ref <project-ref>`.
3. Aplica las migraciones con `npx supabase db push`.

También puedes ejecutar manualmente el contenido de las migraciones, en orden, desde el SQL Editor del dashboard de Supabase. No hay tablas de negocio definidas todavía.
