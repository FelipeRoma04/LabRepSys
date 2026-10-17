-- K02: Ayudantes comunes para simular usuarios por rol en pgTAP
-- Uso: SELECT tests.set_role_context('ADMIN', '<uuid>');

-- Simula un usuario autenticado con un rol específico dentro de la transacción.
-- Siempre hacer ROLLBACK al finalizar el bloque de prueba para no persistir datos.
create or replace function tests.set_role_context(
  role_code text,
  user_id uuid default gen_random_uuid()
)
returns void
language plpgsql
set search_path = pg_catalog, public, auth
as $$
begin
  -- Simular JWT claims de Supabase
  perform set_config('request.jwt.claims', json_build_object(
    'sub', user_id::text,
    'role', 'authenticated'
  )::text, true);
  set local role authenticated;
end;
$$;

-- Crea un perfil de prueba activo con el rol indicado dentro de la transacción.
create or replace function tests.create_test_user(
  role_code text,
  active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := gen_random_uuid();
begin
  -- Insertar directamente en auth.users (solo disponible en test environment con service role)
  insert into auth.users (id, email, role)
  values (v_user_id, v_user_id::text || '@test.local', 'authenticated')
  on conflict do nothing;

  -- Crear perfil
  insert into public.profiles (id, full_name, email, active)
  values (v_user_id, 'Test ' || role_code, v_user_id::text || '@test.local', active)
  on conflict (id) do update set active = excluded.active;

  -- Asignar rol si no es usuario sin rol
  if role_code <> 'NO_ROLE' then
    -- Necesita un asignador; usamos el mismo usuario como bootstrap
    insert into public.user_roles (user_id, role_code, assigned_by)
    values (v_user_id, role_code, v_user_id)
    on conflict do nothing;
  end if;

  return v_user_id;
end;
$$;
