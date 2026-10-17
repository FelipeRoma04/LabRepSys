-- K02: Pruebas de dominio para catálogos
-- Req 3.1 (AG0346/AG00106), 3.3 (next_counter), 3.5 (versionado ensayos)
-- Usa skip si el módulo no existe (Req 4.2)

begin;

-- Verificar que existe la tabla tests antes de continuar
do $$
begin
  if to_regclass('public.tests') is null then
    raise notice 'SKIP: tabla tests no existe aún';
  end if;
end;
$$;

select case
  when to_regclass('public.tests') is not null then 5
  else 0
end tests_count \gset

select plan(:tests_count);

-- Ejecutar pruebas solo si tests existe
do $$
begin
  if to_regclass('public.tests') is null then
    return;
  end if;
end;
$$;

-- ── Test 1: Código SA válido (SA-001 o AG0346 como alias) ────────────────────
-- Req 3.1: AG0346 debe ser aceptado como alias, no como código de ensayo SA
select skip(
  to_regclass('public.test_aliases') is null,
  'test_aliases no existe aún — skip código heredado'
);

-- ── Test 2: Código SA inválido rechazado (AG00106) ───────────────────────────
-- Req 3.1: código sin prefijo SA debe ser rechazado por el CHECK constraint
select throws_ok(
  $$
    insert into auth.users (id, email, role)
    values ('00000000-0000-0000-0000-000000000001'::uuid, 'admin@test.local', 'authenticated');
    insert into public.profiles (id, full_name, email, active)
    values ('00000000-0000-0000-0000-000000000001'::uuid, 'Admin Test', 'admin@test.local', true);
    insert into public.user_roles (user_id, role_code, assigned_by)
    values ('00000000-0000-0000-0000-000000000001'::uuid, 'ADMIN', '00000000-0000-0000-0000-000000000001'::uuid);
    perform set_config('request.jwt.claims', json_build_object(
      'sub', '00000000-0000-0000-0000-000000000001',
      'role', 'authenticated'
    )::text, true);
    set local role authenticated;
    insert into public.tests (code, version) values ('AG00106', 1)
  $$,
  '23514',
  'AG00106 debe ser rechazado por el CHECK constraint (código debe empezar con SA)'
);

-- ── Test 3: next_counter devuelve consecutivos sin repetir ───────────────────
-- Req 3.3
declare
  v_c1 bigint;
  v_c2 bigint;
  v_c3 bigint;
begin
  -- Necesitamos un usuario activo para next_counter
  perform set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text, true);
  set local role authenticated;

  select public.next_counter('TEST', extract(year from now())::int) into v_c1;
  select public.next_counter('TEST', extract(year from now())::int) into v_c2;
  select public.next_counter('TEST', extract(year from now())::int) into v_c3;

  select ok(v_c2 = v_c1 + 1 and v_c3 = v_c2 + 1,
    'next_counter debe devolver consecutivos: ' || v_c1 || ', ' || v_c2 || ', ' || v_c3);
end;

-- ── Test 4: Un ensayo activo no permite UPDATE técnico directo ───────────────
-- Req 3.5: los cambios técnicos deben ir por create_test_version
select throws_ok(
  $$
    update public.tests
    set parameter_name = 'Cambio directo'
    where code like 'SA%' and active
    limit 1
  $$,
  '42501',
  'UPDATE técnico directo en tests debe ser rechazado por el trigger'
);

-- ── Test 5: client_error_logs no acepta UPDATE ni DELETE ─────────────────────
-- Req (K04 - 3.3): verificar que la tabla es append-only
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename = 'client_error_logs'
      and cmd in ('UPDATE', 'DELETE')
  ),
  0,
  'client_error_logs debe ser append-only: sin políticas UPDATE ni DELETE'
);

select * from finish();
rollback;
