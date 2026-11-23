-- K04: append-only client error storage, role isolation, and audit correlation.
begin;

\ir 000_helpers.psql

select plan(10);
select tests.create_test_user('ADMIN_TECNICO') as technical_admin_id \gset
select tests.create_test_user('ANALISTA') as analyst_id \gset
select tests.create_test_user('ANALISTA', false) as inactive_id \gset

create or replace function tests.emit_k04_audit()
returns uuid
language sql
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.log_audit('K04_TEST_DENIED', 'TEST')
$$;

create or replace function tests.get_k04_audit_correlation(p_audit_id uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, public
as $$
  select correlation_id from public.audit_logs where id = p_audit_id
$$;
grant execute on function tests.emit_k04_audit() to authenticated;
grant execute on function tests.get_k04_audit_correlation(uuid) to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', :'analyst_id', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.client_error_logs (route, message, correlation_id, app_version)
values ('/login?token=[REDACTED]', 'Falló [EMAIL] Bearer [TOKEN]', '00000000-0000-4000-8000-000000000001', 'test');
select set_config('request.headers', '{"x-correlation-id":"00000000-0000-4000-8000-000000000001"}', true);
select tests.emit_k04_audit() as audit_id \gset

select is((select count(*)::int from public.client_error_logs), 0,
  'ANALISTA no puede leer registros propios ni de otros');
select throws_ok('update public.client_error_logs set message = ''changed''', '42501', null,
  'ANALISTA no puede actualizar registros de error');
select throws_ok('delete from public.client_error_logs', '42501', null,
  'ANALISTA no puede eliminar registros de error');

select set_config('request.jwt.claims', json_build_object('sub', :'technical_admin_id', 'role', 'authenticated')::text, true);
select ok(exists (select 1 from public.client_error_logs where message = 'Falló [EMAIL] Bearer [TOKEN]'),
  'ADMIN_TECNICO puede leer el error saneado registrado');
select ok(exists (select 1 from public.audit_logs where action = 'K04_TEST_DENIED'),
  'ADMIN_TECNICO solo puede consultar auditorías de intentos denegados');
select is(public.diagnostic_failed_import_count(), 0::bigint,
  'ADMIN_TECNICO consulta el conteo agregado de importaciones fallidas');
select is((select count(*)::int from public.client_error_logs where message like '%@%'), 0,
  'No se persisten correos en el mensaje de error');

select set_config('request.jwt.claims', json_build_object('sub', :'inactive_id', 'role', 'authenticated')::text, true);
select throws_ok(
  $$insert into public.client_error_logs (route, message) values ('/test', 'error')$$,
  '42501', null,
  'Usuario inactivo no puede registrar errores'
);
select throws_ok('select public.diagnostic_failed_import_count()', '42501', null,
  'Usuario inactivo no puede consultar conteos de diagnóstico');

select is(tests.get_k04_audit_correlation(:'audit_id'::uuid)::text,
  '00000000-0000-4000-8000-000000000001',
  'El correlation id del header queda en audit_logs');

select * from finish();
rollback;
