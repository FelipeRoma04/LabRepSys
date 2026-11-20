-- K02: consecutivos y versionado tÃ©cnico de ensayos.
\ir 000_helpers.psql
select to_regclass('public.tests') is not null as has_catalog_module \gset
\if :has_catalog_module
begin;
select plan(3);

insert into public.clients (id, business_name, active)
values ('20000000-0000-0000-0000-000000000001', 'Cliente K02', true);
insert into public.samples (id, code, client_id, status)
values ('20000000-0000-0000-0000-000000000002', 'AG2001', '20000000-0000-0000-0000-000000000001', 'RECEIVED');
insert into public.tests (id, code, parameter_name, active, valid_from)
values ('20000000-0000-0000-0000-000000000003', 'SA-K02-01', 'ParÃ¡metro original', true, date '2025-01-01');
insert into public.sample_tests (id, sample_id, test_id, execution_type)
values ('20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'SA');

select tests.create_test_user('ADMIN') as admin_id \gset
select tests.set_role_context('ADMIN', :'admin_id');
set local role authenticated;

select public.next_counter('K02-TEST', extract(year from current_date)::int) as counter_1 \gset
select public.next_counter('K02-TEST', extract(year from current_date)::int) as counter_2 \gset
select is(:counter_2::bigint, :counter_1::bigint + 1, 'next_counter entrega valores consecutivos');

reset role;
select throws_ok($$update public.tests set parameter_name = 'Cambio no versionado'
  where id = '20000000-0000-0000-0000-000000000003'$$, '42501', null,
  'Un ensayo ya usado no admite cambios tÃ©cnicos directos');

select tests.set_role_context('ADMIN', :'admin_id');
set local role authenticated;
select public.create_test_version(
  '20000000-0000-0000-0000-000000000003',
  jsonb_build_object('parameter_name', 'ParÃ¡metro versionado', 'valid_from', '2026-01-01')
) as version_id \gset
select is(
  (select count(*)::int from public.tests
    where id = :'version_id'::uuid
      and code = 'SA-K02-01'
      and version = 2
      and replaces_test_id = '20000000-0000-0000-0000-000000000003'),
  1,
  'El cambio tÃ©cnico crea una versiÃ³n nueva para el ensayo utilizado'
);

select * from finish();
rollback;
\else
begin;
select plan(1);
select skip('El mÃ³dulo de catÃ¡logos no existe en esta versiÃ³n');
select * from finish();
rollback;
\endif
