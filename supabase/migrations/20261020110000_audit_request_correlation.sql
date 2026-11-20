-- K04 follow-up: propagate the per-request correlation header into existing audits.
-- Keep log_audit's existing signature so already-applied RPC signatures stay stable.
create or replace function public.log_audit(
  action text,
  entity_type text,
  entity_id uuid default null,
  old_data jsonb default null,
  new_data jsonb default null,
  reason text default null,
  correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  audit_id uuid;
  v_correlation_id uuid := correlation_id;
  v_header_value text;
begin
  if auth.uid() is null or not public.current_user_is_active() then
    raise exception using errcode = '42501', message = 'Usuario activo requerido';
  end if;

  if action is null or btrim(action) = ''
    or entity_type is null or btrim(entity_type) = '' then
    raise exception using errcode = '22023', message = 'Acción y tipo de entidad son requeridos';
  end if;

  if v_correlation_id is null then
    v_header_value := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-correlation-id';
    if v_header_value is not null then
      begin
        v_correlation_id := v_header_value::uuid;
      exception when invalid_text_representation then
        v_correlation_id := null;
      end;
    end if;
  end if;

  insert into public.audit_logs (
    user_id, action, entity_type, entity_id, old_data, new_data, reason, correlation_id
  ) values (
    auth.uid(), action, entity_type, entity_id, old_data, new_data, reason, v_correlation_id
  ) returning id into audit_id;

  return audit_id;
end;
$$;

-- Technical admins may inspect denial metadata, but not all functional audit rows.
create policy audit_logs_tech_denied_select
  on public.audit_logs
  for select
  to authenticated
  using (
    public.has_role('ADMIN_TECNICO')
    and action like '%\_DENIED' escape '\'
  );

-- Expose only the count of failed result imports, not sample or result data.
create or replace function public.diagnostic_failed_import_count()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_count bigint;
begin
  if auth.uid() is null or not public.current_user_is_active()
    or not public.has_any_role(array['ADMIN', 'ADMIN_TECNICO']) then
    raise exception using errcode = '42501', message = 'Solo ADMIN y ADMIN_TECNICO pueden consultar el diagnóstico.';
  end if;

  select count(*) into v_count
  from public.result_imports
  where import_status = 'FAILED'
    and created_at >= now() - interval '7 days';
  return v_count;
end;
$$;
revoke all on function public.diagnostic_failed_import_count() from public, anon;
grant execute on function public.diagnostic_failed_import_count() to authenticated;
