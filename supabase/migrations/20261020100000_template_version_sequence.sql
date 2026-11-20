-- K03 follow-up: allocate the next template version atomically per template code.
-- The original migration is already applied and stays unchanged.
create or replace function public.prevent_approved_template_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'APPROVED' and (
    old.configuration is distinct from new.configuration or
    old.code is distinct from new.code or
    old.version is distinct from new.version or
    old.approval_date is distinct from new.approval_date or
    old.approved_by is distinct from new.approved_by or
    old.approved_at is distinct from new.approved_at or
    old.active is distinct from new.active
  ) then
    raise exception using
      errcode = '42501',
      message = 'Una plantilla APPROVED es inmutable. Crea una nueva versión para modificarla.';
  end if;
  return new;
end;
$$;

create or replace function public.new_template_version(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_source public.report_templates%rowtype;
  v_new_id uuid;
  v_next_version integer;
begin
  if auth.uid() is null or not public.current_user_is_active() then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INACTIVE_USER',
      'message', 'Se requiere una sesión de usuario activo.'
    );
  end if;

  if not public.has_role('ADMIN') then
    perform public.log_audit(
      'NEW_TEMPLATE_VERSION_DENIED', 'REPORT_TEMPLATE', p_template_id, null,
      jsonb_build_object('reason', 'rol insuficiente', 'user_id', auth.uid())
    );
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INSUFFICIENT_ROLE',
      'message', 'Se requiere rol ADMIN para crear una nueva versión.'
    );
  end if;

  select * into v_source
  from public.report_templates
  where id = p_template_id and active
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND', 'message', 'Plantilla no encontrada.');
  end if;
  if v_source.status <> 'APPROVED' then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INVALID_STATUS',
      'message', 'Solo una plantilla aprobada puede originar una nueva versión.'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_source.code, 0));
  select coalesce(max(version), 0) + 1 into v_next_version
  from public.report_templates
  where code = v_source.code;

  insert into public.report_templates (
    code, version, status, configuration, active, created_by, updated_by
  ) values (
    v_source.code, v_next_version, 'DRAFT', v_source.configuration, true, auth.uid(), auth.uid()
  ) returning id into v_new_id;

  perform public.log_audit('NEW_TEMPLATE_VERSION', 'REPORT_TEMPLATE', v_new_id, to_jsonb(v_source), null);
  return jsonb_build_object('ok', true, 'new_id', v_new_id);
end;
$$;
