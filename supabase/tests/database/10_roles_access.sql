-- K02: Matriz de acceso por rol y reglas de auditoría
-- Req 2.1, 2.2, 2.3

begin;
select plan(6);

-- ── Test 1: Usuario inactivo no puede leer profiles ──────────────────────────
-- Req 2.1
do $$
declare v_id uuid;
begin
  v_id := tests.create_test_user('ANALISTA', false); -- inactivo
  perform tests.set_role_context('ANALISTA', v_id);
end;
$$;

select is(
  (select count(*)::int from public.profiles),
  0,
  'Usuario inactivo no debe ver registros en profiles'
);

-- Restaurar contexto al rol de prueba con ADMIN activo para el resto
do $$
declare v_id uuid;
begin
  v_id := tests.create_test_user('ADMIN', true);
  perform tests.set_role_context('ADMIN', v_id);
end;
$$;

-- ── Test 2: Usuario sin rol activo no puede leer tablas de catálogos ─────────
-- Req 2.1
do $$
declare v_id uuid;
begin
  v_id := tests.create_test_user('NO_ROLE', true);
  perform tests.set_role_context('NO_ROLE', v_id);
end;
$$;

select is(
  (select count(*)::int from public.matrices),
  0,
  'Usuario activo sin rol no debe ver registros de matrices'
);

-- ── Test 3: ANALISTA no puede insertar en matrices ───────────────────────────
-- Req 2.1
do $$
declare v_id uuid;
begin
  v_id := tests.create_test_user('ANALISTA', true);
  perform tests.set_role_context('ANALISTA', v_id);
end;
$$;

select throws_ok(
  $$insert into public.matrices (code, name) values ('TEST-RLS', 'Test RLS')$$,
  'new row violates row-level security policy for table "matrices"',
  'ANALISTA no debe poder insertar en matrices'
);

-- ── Test 4: audit_logs no acepta UPDATE de ningún usuario funcional ──────────
-- Req 2.3 — verificar que no existe política UPDATE para authenticated
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and cmd = 'UPDATE'
  ),
  0,
  'audit_logs no debe tener política UPDATE para usuarios funcionales'
);

-- ── Test 5: audit_logs no acepta DELETE de ningún usuario funcional ──────────
-- Req 2.3
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and cmd = 'DELETE'
  ),
  0,
  'audit_logs no debe tener política DELETE para usuarios funcionales'
);

-- ── Test 6: Ningún usuario puede asignarse roles propios por INSERT directo ───
-- Req 2.2 — RLS impide insertar user_roles directamente para otro usuario
do $$
declare v_analista uuid;
begin
  v_analista := tests.create_test_user('ANALISTA', true);
  perform tests.set_role_context('ANALISTA', v_analista);
end;
$$;

select throws_ok(
  $$insert into public.user_roles (user_id, role_code, assigned_by)
    select auth.uid(), 'ADMIN', auth.uid()$$,
  null,
  'Un ANALISTA no debe poder asignarse el rol ADMIN directamente'
);

select * from finish();
rollback;
