-- K02: Acceso a catálogos, privilegios por rol y protección de auditoría.
\ir 000_helpers.psql
begin;
select plan(22);

-- Fixture creado por el usuario de migraciones antes de aplicar el rol funcional.
insert into public.matrices (code, name) values ('K02-ACCESS', 'Fixture de acceso');

select tests.create_test_user('ADMIN') as admin_id \gset
select tests.create_test_user('ADMIN_TECNICO') as admin_tecnico_id \gset
select tests.create_test_user('COMERCIAL') as comercial_id \gset
select tests.create_test_user('MUESTREO') as muestreo_id \gset
select tests.create_test_user('RECEPCION') as recepcion_id \gset
select tests.create_test_user('ANALISTA') as analista_id \gset
select tests.create_test_user('JEFE_TECNICA_CALIDAD') as jtc_id \gset
select tests.create_test_user('AUDITOR') as auditor_id \gset
select tests.create_test_user('ANALISTA', false) as inactive_id \gset
select tests.create_test_user('NO_ROLE') as no_role_id \gset

set local role authenticated;

select tests.set_role_context('ANALISTA', :'inactive_id');
select is((select count(*)::int from public.matrices where code = 'K02-ACCESS'), 0,
  'Un usuario inactivo no puede leer catálogos');

select tests.set_role_context('NO_ROLE', :'no_role_id');
select is((select count(*)::int from public.matrices where code = 'K02-ACCESS'), 0,
  'Un usuario activo sin rol no puede leer catálogos');

select tests.set_role_context('ADMIN', :'admin_id');
select is((select count(*)::int from public.matrices where code = 'K02-ACCESS'), 1, 'ADMIN puede leer matrices');
select tests.set_role_context('ADMIN_TECNICO', :'admin_tecnico_id');
select is((select count(*)::int from public.matrices where code = 'K02-ACCESS'), 1, 'ADMIN_TECNICO puede leer matrices');
select tests.set_role_context('COMERCIAL', :'comercial_id');
select is((select count(*)::int from public.matrices where code = 'K02-ACCESS'), 1, 'COMERCIAL puede leer matrices');
select tests.set_role_context('MUESTREO', :'muestreo_id');
select is((select count(*)::int from public.matrices where code = 'K02-ACCESS'), 1, 'MUESTREO puede leer matrices');
select tests.set_role_context('RECEPCION', :'recepcion_id');
select is((select count(*)::int from public.matrices where code = 'K02-ACCESS'), 1, 'RECEPCION puede leer matrices');
select tests.set_role_context('ANALISTA', :'analista_id');
select is((select count(*)::int from public.matrices where code = 'K02-ACCESS'), 1, 'ANALISTA puede leer matrices');
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'jtc_id');
select is((select count(*)::int from public.matrices where code = 'K02-ACCESS'), 1, 'JEFE_TECNICA_CALIDAD puede leer matrices');
select tests.set_role_context('AUDITOR', :'auditor_id');
select is((select count(*)::int from public.matrices where code = 'K02-ACCESS'), 1, 'AUDITOR puede leer matrices');

select tests.set_role_context('ADMIN', :'admin_id');
select lives_ok($$insert into public.matrices (code, name) values ('K02-ADMIN-WRITE', 'ADMIN')$$,
  'ADMIN puede crear matrices');
select tests.set_role_context('ADMIN_TECNICO', :'admin_tecnico_id');
select throws_ok($$insert into public.matrices (code, name) values ('K02-AT-WRITE', 'ADMIN_TECNICO')$$,
  '42501', null, 'ADMIN_TECNICO no puede crear matrices');
select tests.set_role_context('COMERCIAL', :'comercial_id');
select throws_ok($$insert into public.matrices (code, name) values ('K02-COM-WRITE', 'COMERCIAL')$$,
  '42501', null, 'COMERCIAL no puede crear matrices');
select tests.set_role_context('MUESTREO', :'muestreo_id');
select throws_ok($$insert into public.matrices (code, name) values ('K02-MUE-WRITE', 'MUESTREO')$$,
  '42501', null, 'MUESTREO no puede crear matrices');
select tests.set_role_context('RECEPCION', :'recepcion_id');
select throws_ok($$insert into public.matrices (code, name) values ('K02-REC-WRITE', 'RECEPCION')$$,
  '42501', null, 'RECEPCION no puede crear matrices');
select tests.set_role_context('ANALISTA', :'analista_id');
select throws_ok($$insert into public.matrices (code, name) values ('K02-ANA-WRITE', 'ANALISTA')$$,
  '42501', null, 'ANALISTA no puede crear matrices');
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'jtc_id');
select throws_ok($$insert into public.matrices (code, name) values ('K02-JTC-WRITE', 'JTC')$$,
  '42501', null, 'JEFE_TECNICA_CALIDAD no puede crear matrices');
select tests.set_role_context('AUDITOR', :'auditor_id');
select throws_ok($$insert into public.matrices (code, name) values ('K02-AUD-WRITE', 'AUDITOR')$$,
  '42501', null, 'AUDITOR no puede crear matrices');

select tests.set_role_context('ANALISTA', :'analista_id');
select throws_ok($$insert into public.user_roles (user_id, role_code, assigned_by)
  values (auth.uid(), 'ADMIN', auth.uid())$$, '42501', null,
  'Un usuario funcional no puede asignarse roles');

select tests.set_role_context('ANALISTA', :'inactive_id');
update public.profiles set active = true where id = auth.uid();
select is((select active from public.profiles where id = auth.uid()), false,
  'Un usuario no puede activar su propio perfil');

select tests.set_role_context('ANALISTA', :'analista_id');
select throws_ok($$update public.audit_logs set action = action where false$$, '42501', null,
  'Usuarios funcionales no tienen permiso UPDATE en audit_logs');
select throws_ok($$delete from public.audit_logs where false$$, '42501', null,
  'Usuarios funcionales no tienen permiso DELETE en audit_logs');

select * from finish();
rollback;
