-- K02: segregaciÃ³n de funciones RSA e inmutabilidad tras emitir.
\ir 000_helpers.psql
select to_regclass('public.reports') is not null as has_rsa_module \gset
\if :has_rsa_module
begin;
select plan(11);

select tests.create_test_user('ADMIN') as admin_id \gset
select tests.create_test_user('ANALISTA') as analyst_id \gset
select tests.create_test_user('JEFE_TECNICA_CALIDAD') as quality_lead_id \gset

-- Este usuario preparador tambiÃ©n tiene JTC para probar la regla de segregaciÃ³n,
-- aunque el usuario de emisiÃ³n es distinto.
insert into public.user_roles (user_id, role_code, assigned_by)
values (:'analyst_id'::uuid, 'JEFE_TECNICA_CALIDAD', :'admin_id'::uuid);

insert into public.clients (id, business_name, active)
values
  ('40000000-0000-0000-0000-000000000001', 'Cliente RSA K02', true),
  ('40000000-0000-0000-0000-000000000099', 'Otro cliente RSA K02', true);

select tests.set_role_context('ANALISTA', :'analyst_id');
set local role authenticated;
insert into public.reports (prepared_by, status, client_id, created_by, updated_by)
values (:'analyst_id'::uuid, 'DRAFT', '40000000-0000-0000-0000-000000000001',
        :'analyst_id'::uuid, :'analyst_id'::uuid)
returning id as report_id \gset
insert into public.report_samples (report_id, sample_id)
values (:'report_id'::uuid, '40000000-0000-0000-0000-000000000002');

-- Un analista no puede enviar el borrador a revisiÃ³n y el intento debe quedar auditado.
select is((public.transition_report(:'report_id'::uuid, 'IN_REVIEW', null) ->> 'ok'), 'false',
  'ANALISTA no puede enviar el reporte a revisiÃ³n');
select ok(exists (
  select 1 from public.audit_logs
  where action = 'TRANSITION_REPORT_DENIED' and entity_id = :'report_id'::uuid
), 'El intento denegado del analista queda auditado');

-- El JTC avanza el flujo legÃ­timo hasta revisiÃ³n.
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'quality_lead_id');
select public.transition_report(:'report_id'::uuid, 'VALIDATING', null);
select public.transition_report(:'report_id'::uuid, 'READY_FOR_REVIEW', null);
select public.transition_report(:'report_id'::uuid, 'IN_REVIEW', null);

-- Quien preparÃ³ no puede aprobar ni emitir, aunque tenga el rol JTC.
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'analyst_id');
select is((public.transition_report(:'report_id'::uuid, 'APPROVED', null) ->> 'ok'), 'false',
  'El preparador no puede aprobar su propio reporte');
select ok(exists (
  select 1 from public.audit_logs
  where action = 'TRANSITION_REPORT_DENIED' and entity_id = :'report_id'::uuid
    and new_data ->> 'reason' = 'segregacion_preparador_aprobador'
), 'El intento de aprobaciÃ³n por el preparador queda auditado');
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'quality_lead_id');
select public.transition_report(:'report_id'::uuid, 'APPROVED', null);
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'analyst_id');
select is((public.issue_report(:'report_id'::uuid) ->> 'ok'), 'false',
  'El preparador no puede emitir su propio reporte');
select ok(exists (
  select 1 from public.audit_logs
  where action = 'ISSUE_REPORT_DENIED' and entity_id = :'report_id'::uuid
), 'El intento denegado de emisiÃ³n queda auditado');

select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'quality_lead_id');
select is((public.issue_report(:'report_id'::uuid) ->> 'ok'), 'true',
  'Un JTC distinto del preparador puede emitir el reporte');
select ok((select code ~ '^RSA-[0-9]+-[0-9]{4}$' and status = 'ISSUED'
  from public.reports where id = :'report_id'::uuid),
  'El reporte emitido tiene consecutivo RSA y estado ISSUED');

select tests.set_role_context('ANALISTA', :'analyst_id');
with updated as (
  update public.reports set client_id = '40000000-0000-0000-0000-000000000099'
  where id = :'report_id'::uuid returning id
)
select is(
  (select count(*)::int from updated),
  0,
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
select skip('El mÃ³dulo RSA no existe en esta versiÃ³n');
select * from finish();
rollback;
\endif
