-- K02: segregación de funciones RSA e inmutabilidad tras emitir.
\ir 000_helpers.psql
select to_regclass('public.reports') is not null as has_rsa_module \gset
\if :has_rsa_module
begin;
select plan(11);
select tests.authenticate_fixture_admin() as fixture_admin_id \gset

select tests.create_test_user('ADMIN') as admin_id \gset
select tests.create_test_user('ANALISTA') as analyst_id \gset
select tests.create_test_user('JEFE_TECNICA_CALIDAD') as quality_lead_id \gset

-- Este usuario preparador también tiene JTC para probar la regla de segregación,
-- aunque el usuario de emisión es distinto.
insert into public.user_roles (user_id, role_code, assigned_by)
values (:'analyst_id'::uuid, 'JEFE_TECNICA_CALIDAD', :'admin_id'::uuid);

insert into public.clients (id, business_name, active)
values
  ('40000000-0000-0000-0000-000000000001', 'Cliente RSA K02', true),
  ('40000000-0000-0000-0000-000000000099', 'Otro cliente RSA K02', true);
insert into public.samples (id, code, client_id, status, sampled_at, received_at)
values
  ('40000000-0000-0000-0000-000000000002', 'AG4002', '40000000-0000-0000-0000-000000000001',
   'RECEIVED', now() - interval '2 days', now() - interval '1 day'),
  ('40000000-0000-0000-0000-000000000003', 'AG4003', '40000000-0000-0000-0000-000000000001',
   'RECEIVED', now() - interval '2 days', now() - interval '1 day');

-- Fixture mínimo para que la emisión tenga plantilla aprobada y un resultado completo.
select id as test_id from public.tests where active order by code limit 1 \gset
-- La semilla aún no tiene ensayos emitibles (faltan datos de catálogo pendientes de
-- decisión). Esta prueba cubre segregación e inmutabilidad, no calidad de catálogo:
-- se desactivan solo estas dos reglas dentro de la transacción (se revierte al final).
update public.validation_rules set active = false
 where code in ('VAL_CATALOG_INCOMPLETE', 'VAL_RESULT_UNIT');
select id as lab_id from public.laboratories order by id limit 1 \gset
insert into public.report_templates (code, version, status, approved_at, active, created_by, updated_by)
values ('K02-RSA', 1, 'APPROVED', now(), true, :'fixture_admin_id'::uuid, :'fixture_admin_id'::uuid)
returning id as template_id \gset
insert into public.sample_tests (sample_id, test_id, execution_type)
values ('40000000-0000-0000-0000-000000000002', :'test_id'::uuid, 'SA');
insert into public.results (sample_id, test_id, laboratory_id, entry_mechanism, entered_by,
  analysis_start, analysis_end, method_text, accreditation_type, status)
values ('40000000-0000-0000-0000-000000000002', :'test_id'::uuid, :'lab_id'::uuid, 'MANUAL',
  :'fixture_admin_id'::uuid, current_date - 1, current_date, 'Método K02', 'ACCREDITED', 'CONFIRMED')
returning id as result_id \gset

select tests.set_role_context('ANALISTA', :'analyst_id');
set local role authenticated;
insert into public.reports (prepared_by, status, client_id, template_id, created_by, updated_by)
values (:'analyst_id'::uuid, 'DRAFT', '40000000-0000-0000-0000-000000000001', :'template_id'::uuid,
        :'analyst_id'::uuid, :'analyst_id'::uuid)
returning id as report_id \gset
insert into public.report_samples (report_id, sample_id)
values (:'report_id'::uuid, '40000000-0000-0000-0000-000000000002');
insert into public.report_results (report_id, result_id)
values (:'report_id'::uuid, :'result_id'::uuid);

-- El analista no puede saltarse el flujo y enviar el borrador directo a revisión.
select is((public.transition_report(:'report_id'::uuid, 'IN_REVIEW', null) ->> 'ok'), 'false',
  'ANALISTA no puede enviar el reporte a revisión');
reset role;
select ok(exists (
  select 1 from public.audit_logs
  where action = 'REPORT_TRANSITION_DENIED' and entity_id = :'report_id'::uuid
), 'El intento denegado del analista queda auditado');
set local role authenticated;

-- El preparador lleva el borrador a revisión y el JTC lo toma.
select public.transition_report(:'report_id'::uuid, 'VALIDATING', null);
select public.transition_report(:'report_id'::uuid, 'READY_FOR_REVIEW', null);
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'quality_lead_id');
select public.transition_report(:'report_id'::uuid, 'IN_REVIEW', null);

-- Quien preparó no puede aprobar ni emitir, aunque tenga el rol JTC.
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'analyst_id');
select is((public.transition_report(:'report_id'::uuid, 'APPROVED', null) ->> 'ok'), 'false',
  'El preparador no puede aprobar su propio reporte');
reset role;
select ok(exists (
  select 1 from public.audit_logs
  where action = 'REPORT_TRANSITION_DENIED' and entity_id = :'report_id'::uuid
    and new_data ->> 'reason' = 'SEGREGATION_VIOLATION'
), 'El intento de aprobación por el preparador queda auditado');
set local role authenticated;
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'quality_lead_id');
select public.transition_report(:'report_id'::uuid, 'APPROVED', null);
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'analyst_id');
select is((public.issue_report(:'report_id'::uuid) ->> 'ok'), 'false',
  'El preparador no puede emitir su propio reporte');
reset role;
select ok(exists (
  select 1 from public.audit_logs
  where action = 'ISSUE_REPORT_DENIED' and entity_id = :'report_id'::uuid
), 'El intento denegado de emisión queda auditado');
set local role authenticated;

select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'quality_lead_id');
select is((public.issue_report(:'report_id'::uuid) ->> 'ok'), 'true',
  'Un JTC distinto del preparador puede emitir el reporte');
select ok((select code ~ '^RSA [0-9]{4}-[0-9]{4}$' and status = 'ISSUED'
  from public.reports where id = :'report_id'::uuid),
  'El reporte emitido tiene consecutivo RSA y estado ISSUED');

select tests.set_role_context('ANALISTA', :'analyst_id');
select throws_ok(
  format('update public.reports set client_id = %L::uuid where id = %L::uuid',
    '40000000-0000-0000-0000-000000000099', :'report_id'),
  '42501', null,
  'El analista no puede modificar un reporte emitido'
);
select throws_ok(format(
  'insert into public.report_samples (report_id, sample_id) values (%L::uuid, %L::uuid)',
  :'report_id', '40000000-0000-0000-0000-000000000003'), '42501', null,
  'No se pueden agregar filas a un reporte emitido');
select ok(
  (select bool_and(
    not has_table_privilege('authenticated', format('public.%I', relation_name), 'UPDATE')
    and not has_table_privilege('authenticated', format('public.%I', relation_name), 'DELETE')
  ) from unnest(array[
    'reports', 'report_samples', 'report_results', 'report_regulation_columns',
    'report_reviews', 'report_approvals', 'report_snapshots', 'report_files'
  ]) as relation_name),
  'Un reporte emitido y sus filas relacionadas no permiten UPDATE ni DELETE directos');

select * from finish();
rollback;
\else
begin;
select plan(1);
select skip('El módulo RSA no existe en esta versión');
select * from finish();
rollback;
\endif
