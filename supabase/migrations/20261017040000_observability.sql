-- K04: Observabilidad y manejo de errores
-- client_error_logs: tabla de errores de cliente con RLS estricto
-- Req 1.2, 3.3

create table public.client_error_logs (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references public.profiles(id) on delete set null,
  route         text        not null,
  message       text        not null,
  stack_hash    text,
  correlation_id text,
  app_version   text,
  created_at    timestamptz not null default now()
);

-- Sin updated_at: inmutable por diseño (solo INSERT permitido a usuarios)
alter table public.client_error_logs enable row level security;
revoke all on public.client_error_logs from anon, authenticated;
grant insert, select on public.client_error_logs to authenticated;

-- Usuarios autenticados activos pueden insertar sus propios errores
create policy "client_error_logs: insert propio activo"
  on public.client_error_logs
  for insert
  to authenticated
  with check (
    public.current_user_is_active()
    and (user_id = auth.uid() or user_id is null)
  );

-- Solo ADMIN y ADMIN_TECNICO pueden leer
create policy "client_error_logs: lectura admin"
  on public.client_error_logs
  for select
  to authenticated
  using (
    public.has_any_role(array['ADMIN', 'ADMIN_TECNICO'])
  );

-- Sin UPDATE ni DELETE para ningún rol funcional (la tabla es append-only)

-- ─── Vista de resumen para el panel de diagnóstico ────────────────────────────
-- Req 3.1: errores de últimos 7 días, importaciones fallidas, intentos denegados

create or replace view public.v_error_summary
with (security_invoker = true)
as
select
  date_trunc('hour', cel.created_at) as hour_bucket,
  cel.route,
  count(*) as error_count
from public.client_error_logs cel
where cel.created_at >= now() - interval '7 days'
group by date_trunc('hour', cel.created_at), cel.route
order by hour_bucket desc, error_count desc;

-- ─── Vista de intentos denegados desde audit_logs ────────────────────────────
create or replace view public.v_denied_attempts
with (security_invoker = true)
as
select
  al.id,
  al.user_id,
  al.action,
  al.entity_type,
  al.entity_id,
  al.reason as details,
  al.created_at
from public.audit_logs al
where al.action like '%_DENIED'
  and al.created_at >= now() - interval '7 days'
order by al.created_at desc;

revoke all on public.v_error_summary, public.v_denied_attempts from anon, authenticated;
grant select on public.v_error_summary, public.v_denied_attempts to authenticated;
