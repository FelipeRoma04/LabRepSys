-- learn_test_alias: alias aprendidos desde la carga de resultados.
\ir 000_helpers.psql
begin;
select plan(8);
select tests.authenticate_fixture_admin() as fixture_admin_id \gset

select tests.create_test_user('ANALISTA') as analyst_id \gset
select tests.create_test_user('RECEPCION') as reception_id \gset
select id as test_a from public.tests where active order by code limit 1 \gset
select id as test_b from public.tests where active order by code offset 1 limit 1 \gset
select id as lab_id from public.laboratories where code = 'SA2' \gset

set local role authenticated;

select tests.set_role_context('RECEPCION', :'reception_id');
select is(public.learn_test_alias(:'test_a'::uuid, :'lab_id'::uuid, 'Hierro total K48') ->> 'error_code',
  'INSUFFICIENT_ROLE', 'Un rol no permitido no crea alias');

select tests.set_role_context('ANALISTA', :'analyst_id');
select is(public.learn_test_alias(:'test_a'::uuid, :'lab_id'::uuid, '  Hierro   total K48 ') ->> 'created',
  'true', 'El analista crea el alias desde la carga');
select ok(exists (select 1 from public.test_aliases where test_id = :'test_a'::uuid
                   and laboratory_id = :'lab_id'::uuid and external_name = 'Hierro total K48' and active),
  'El alias queda activo, con el nombre sin espacios sobrantes');
select is(public.learn_test_alias(:'test_a'::uuid, :'lab_id'::uuid, 'HIERRO TOTAL K48') ->> 'created',
  'false', 'Repetir el mismo alias no crea un duplicado');
select is(public.learn_test_alias(:'test_b'::uuid, :'lab_id'::uuid, 'hierro total k48') ->> 'error_code',
  'ALIAS_CONFLICT', 'Un alias nunca se reasigna en silencio a otro ensayo');
select throws_ok(
  format('insert into public.test_aliases (test_id, laboratory_id, alias_type, external_name) values (%L::uuid, %L::uuid, %L, %L)',
    :'test_b', :'lab_id', 'EXTERNAL_NAME', 'Directo K48'),
  '42501', null, 'El analista sigue sin poder insertar alias directamente');

reset role;
select ok(exists (select 1 from public.audit_logs where action = 'TEST_ALIAS_LEARNED'
                   and new_data ->> 'external_name' = 'Hierro total K48'),
  'La creación del alias queda auditada');
select ok(exists (select 1 from public.audit_logs where action = 'TEST_ALIAS_LEARN_DENIED'),
  'El intento sin rol queda auditado');

select * from finish();
rollback;
