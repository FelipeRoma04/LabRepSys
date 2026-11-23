-- Alias que se aprenden en la carga de resultados (Bloque B, tarea 6).
--
-- Cuando un nombre de ensayo de un laboratorio externo no tiene alias, quien
-- carga resultados lo asocia al ensayo SA una vez y queda guardado para la
-- próxima carga. Los catálogos siguen cerrados a INSERT directo (solo ADMIN);
-- esta función es la única vía para los demás roles permitidos.
--
-- Parámetro: catalog.alias.learn_roles (por defecto ADMIN y ANALISTA).
-- Decisión pendiente del área de calidad: si un analista puede crear alias sin
-- aprobación. Un alias nunca sobrescribe otro: si el nombre ya apunta a otro
-- ensayo en ese laboratorio, se rechaza (ALIAS_CONFLICT).

insert into public.app_settings (key, value, description)
values (
  'catalog.alias.learn_roles',
  '["ADMIN", "ANALISTA"]'::jsonb,
  'Roles que pueden crear alias de nombre externo desde la carga de resultados. Pendiente de confirmar con calidad.'
)
on conflict (key) do nothing;

create or replace function public.normalize_alias_name(p_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.learn_test_alias(
  p_test_id uuid,
  p_laboratory_id uuid,
  p_external_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_external_name, '')), '\s+', ' ', 'g');
  v_roles text[];
  v_existing public.test_aliases%rowtype;
  v_alias_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_active() then
    raise exception using errcode = '42501', message = 'Usuario activo requerido';
  end if;

  select coalesce(array_agg(role_code), array['ADMIN'])
    into v_roles
    from public.app_settings setting,
         jsonb_array_elements_text(setting.value) as role_code
   where setting.key = 'catalog.alias.learn_roles'
     and jsonb_typeof(setting.value) = 'array';

  if not public.has_any_role(v_roles) then
    perform public.log_audit('TEST_ALIAS_LEARN_DENIED', 'TEST', p_test_id, null,
      jsonb_build_object('reason', 'INSUFFICIENT_ROLE', 'laboratory_id', p_laboratory_id, 'external_name', v_name));
    return jsonb_build_object('ok', false, 'error_code', 'INSUFFICIENT_ROLE',
      'message', 'Tu rol no permite crear alias de ensayos.');
  end if;
  if v_name = '' or p_laboratory_id is null or p_test_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT',
      'message', 'Indica el ensayo, el laboratorio y el nombre del laboratorio.');
  end if;
  if not exists (select 1 from public.tests where id = p_test_id and active) then
    return jsonb_build_object('ok', false, 'error_code', 'TEST_NOT_FOUND', 'message', 'El ensayo no existe o está inactivo.');
  end if;
  if not exists (select 1 from public.laboratories where id = p_laboratory_id and active) then
    return jsonb_build_object('ok', false, 'error_code', 'LABORATORY_NOT_FOUND', 'message', 'El laboratorio no existe o está inactivo.');
  end if;

  select * into v_existing
    from public.test_aliases alias
   where alias.active
     and alias.alias_type = 'EXTERNAL_NAME'
     and alias.laboratory_id = p_laboratory_id
     and public.normalize_alias_name(alias.external_name) = public.normalize_alias_name(v_name)
   limit 1;

  if found then
    if v_existing.test_id = p_test_id then
      return jsonb_build_object('ok', true, 'created', false, 'alias_id', v_existing.id);
    end if;
    return jsonb_build_object('ok', false, 'error_code', 'ALIAS_CONFLICT',
      'message', 'Ese nombre ya está asociado a otro ensayo para este laboratorio. Revísalo en Catálogos.');
  end if;

  insert into public.test_aliases (test_id, laboratory_id, alias_type, external_name, created_by, updated_by)
  values (p_test_id, p_laboratory_id, 'EXTERNAL_NAME', v_name, auth.uid(), auth.uid())
  returning id into v_alias_id;

  perform public.log_audit('TEST_ALIAS_LEARNED', 'TEST', p_test_id, null,
    jsonb_build_object('alias_id', v_alias_id, 'laboratory_id', p_laboratory_id, 'external_name', v_name));

  return jsonb_build_object('ok', true, 'created', true, 'alias_id', v_alias_id);
end;
$$;

revoke all on function public.learn_test_alias(uuid, uuid, text) from public, anon;
grant execute on function public.learn_test_alias(uuid, uuid, text) to authenticated;
