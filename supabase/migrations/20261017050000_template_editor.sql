-- K03: Editor de plantillas de reporte
-- Agrega columnas de aprobación, bucket template-assets, trigger de inmutabilidad
-- y RPCs approve_template / new_template_version

-- ─── Columnas de aprobación (si no existen) ───────────────────────────────────
alter table public.report_templates
  add column if not exists approved_by uuid references public.profiles(id) on delete restrict,
  add column if not exists approved_at timestamptz;

-- ─── Bucket privado template-assets ─────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('template-assets', 'template-assets', false)
on conflict (id) do nothing;

-- Los assets permanecen privados y solo el ADMIN puede subirlos.
create policy "template-assets: insert admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'template-assets'
    and public.has_role('ADMIN')
  );

-- ─── Trigger: configuración de plantilla APPROVED es inmutable ───────────────
-- Req 2.2 K03
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
    old.approved_at is distinct from new.approved_at
  ) then
    raise exception using
      errcode = '42501',
      message = 'Una plantilla APPROVED es inmutable. Crea una nueva versión para modificarla.';
  end if;
  return new;
end;
$$;

create trigger report_templates_prevent_approved_update
before update on public.report_templates
for each row execute function public.prevent_approved_template_update();

-- ─── RPC: approve_template ───────────────────────────────────────────────────
-- Solo JEFE_TECNICA_CALIDAD puede aprobar.
-- Devuelve {ok, error_code, message} — nunca RAISE para que la auditoría no se revierta.
-- Req K03 2.2, K11 segregación (patrón)
create or replace function public.approve_template(
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_template public.report_templates%rowtype;
begin
  if auth.uid() is null or not public.current_user_is_active() then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INACTIVE_USER',
      'message', 'Se requiere una sesión de usuario activo.'
    );
  end if;

  -- Verificar rol
  if not public.has_role('JEFE_TECNICA_CALIDAD') then
    perform public.log_audit(
      'APPROVE_TEMPLATE_DENIED',
      'REPORT_TEMPLATE',
      p_template_id,
      null,
      jsonb_build_object('reason', 'rol insuficiente', 'user_id', auth.uid())
    );
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INSUFFICIENT_ROLE',
      'message', 'Solo JEFE_TECNICA_CALIDAD puede aprobar plantillas.'
    );
  end if;

  select * into v_template
  from public.report_templates
  where id = p_template_id
    and active
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND', 'message', 'Plantilla no encontrada.');
  end if;

  if v_template.status <> 'DRAFT' then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INVALID_STATUS',
      'message', 'Solo se pueden aprobar plantillas en estado DRAFT.'
    );
  end if;

  update public.report_templates
  set
    status = 'APPROVED',
    approved_by = auth.uid(),
    approved_at = now(),
    approval_date = current_date
  where id = p_template_id;

  perform public.log_audit(
    'APPROVE_TEMPLATE',
    'REPORT_TEMPLATE',
    p_template_id,
    to_jsonb(v_template),
    jsonb_build_object(
      'status', 'APPROVED',
      'approved_by', auth.uid(),
      'approved_at', now(),
      'approval_date', current_date
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- ─── RPC: new_template_version ───────────────────────────────────────────────
-- Crea una nueva versión DRAFT copiando la plantilla indicada.
-- Req K03 2.3
create or replace function public.new_template_version(
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_source public.report_templates%rowtype;
  v_new_id uuid;
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
      'NEW_TEMPLATE_VERSION_DENIED',
      'REPORT_TEMPLATE',
      p_template_id,
      null,
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
  where id = p_template_id
    and active
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

  insert into public.report_templates (
    code, version, status, configuration, active, created_by, updated_by
  )
  values (
    v_source.code,
    v_source.version + 1,
    'DRAFT',
    v_source.configuration,
    true,
    auth.uid(),
    auth.uid()
  )
  returning id into v_new_id;

  perform public.log_audit(
    'NEW_TEMPLATE_VERSION',
    'REPORT_TEMPLATE',
    v_new_id,
    to_jsonb(v_source),
    null
  );

  return jsonb_build_object('ok', true, 'new_id', v_new_id);
end;
$$;

-- ─── RPC: retire_template ────────────────────────────────────────────────────
create or replace function public.retire_template(
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_template public.report_templates%rowtype;
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
      'RETIRE_TEMPLATE_DENIED',
      'REPORT_TEMPLATE',
      p_template_id,
      null,
      jsonb_build_object('reason', 'rol insuficiente', 'user_id', auth.uid())
    );
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INSUFFICIENT_ROLE',
      'message', 'Se requiere rol ADMIN para retirar una plantilla.'
    );
  end if;

  select * into v_template
  from public.report_templates
  where id = p_template_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND', 'message', 'Plantilla no encontrada.');
  end if;

  if v_template.status = 'RETIRED' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_STATUS', 'message', 'La plantilla ya está retirada.');
  end if;

  update public.report_templates
  set status = 'RETIRED'
  where id = p_template_id;

  perform public.log_audit(
    'RETIRE_TEMPLATE',
    'REPORT_TEMPLATE',
    p_template_id,
    to_jsonb(v_template),
    jsonb_build_object('status', 'RETIRED')
  );
  return jsonb_build_object('ok', true);
end;
$$;

-- Permisos
revoke all on function public.prevent_approved_template_update() from public, anon, authenticated;
revoke all on function public.approve_template(uuid) from public, anon, authenticated;
revoke all on function public.new_template_version(uuid) from public, anon, authenticated;
revoke all on function public.retire_template(uuid) from public, anon, authenticated;
grant update(configuration) on public.report_templates to authenticated;
grant execute on function public.approve_template(uuid) to authenticated;
grant execute on function public.new_template_version(uuid) to authenticated;
grant execute on function public.retire_template(uuid) to authenticated;
