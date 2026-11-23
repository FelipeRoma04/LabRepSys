-- void_report: anulación con motivo, rol permitido, segregación y auditoría.
\ir 000_helpers.psql
begin;
select plan(10);
select tests.authenticate_fixture_admin() as fixture_admin_id \gset

select tests.create_test_user('ANALISTA') as analyst_id \gset
select tests.create_test_user('JEFE_TECNICA_CALIDAD') as quality_lead_id \gset
select tests.create_test_user('JEFE_TECNICA_CALIDAD') as other_lead_id \gset
-- El preparador también es JTC, para probar la segregación.
insert into public.user_roles (user_id, role_code, assigned_by)
values (:'analyst_id'::uuid, 'JEFE_TECNICA_CALIDAD', :'fixture_admin_id'::uuid);

update public.validation_rules set active = false
 where code in ('VAL_CATALOG_INCOMPLETE', 'VAL_RESULT_UNIT');

insert into public.clients (id, business_name, active)
values ('47000000-0000-0000-0000-000000000001', 'Cliente anulación', true);
insert into public.samples (id, code, client_id, status, sampled_at, received_at, is_demo)
values ('47000000-0000-0000-0000-000000000002', 'AG4702', '47000000-0000-0000-0000-000000000001',
        'RECEIVED', now() - interval '2 days', now() - interval '1 day', true);
select id as test_id from public.tests where active order by code limit 1 \gset
select id as lab_id from public.laboratories order by id limit 1 \gset
insert into public.report_templates (code, version, status, approved_at, active, created_by, updated_by)
values ('K47-RSA', 1, 'APPROVED', now(), true, :'fixture_admin_id'::uuid, :'fixture_admin_id'::uuid)
returning id as template_id \gset
insert into public.results (sample_id, test_id, laboratory_id, entry_mechanism, entered_by,
  analysis_start, analysis_end, method_text, accreditation_type, status)
values ('47000000-0000-0000-0000-000000000002', :'test_id'::uuid, :'lab_id'::uuid, 'MANUAL',
  :'fixture_admin_id'::uuid, current_date - 1, current_date, 'Método K47', 'ACCREDITED', 'CONFIRMED');

-- Reporte emitido: lo prepara el analista y lo emite otro JTC.
select tests.set_role_context('ANALISTA', :'analyst_id');
insert into public.reports (prepared_by, status, client_id, template_id, created_by, updated_by)
values (:'analyst_id'::uuid, 'DRAFT', '47000000-0000-0000-0000-000000000001', :'template_id'::uuid,
        :'analyst_id'::uuid, :'analyst_id'::uuid)
returning id as report_id \gset
insert into public.report_samples (report_id, sample_id)
values (:'report_id'::uuid, '47000000-0000-0000-0000-000000000002');
insert into public.report_results (report_id, result_id)
select :'report_id'::uuid, id from public.results where sample_id = '47000000-0000-0000-0000-000000000002';
select public.transition_report(:'report_id'::uuid, 'VALIDATING', null);
select public.transition_report(:'report_id'::uuid, 'READY_FOR_REVIEW', null);
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'quality_lead_id');
select public.transition_report(:'report_id'::uuid, 'IN_REVIEW', null);
select public.transition_report(:'report_id'::uuid, 'APPROVED', null);
select public.issue_report(:'report_id'::uuid) ->> 'code' as report_code \gset

set local role authenticated;

select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'other_lead_id');
select is(public.void_report(:'report_id'::uuid, 'corto') ->> 'error_code', 'REASON_REQUIRED',
  'La anulación exige un motivo');

select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'analyst_id');
select is(public.void_report(:'report_id'::uuid, 'Error de transcripción en el reporte') ->> 'error_code',
  'SEGREGATION_VIOLATION', 'Quien preparó el reporte no puede anularlo aunque sea JTC');

-- Sin el rol JTC, el preparador queda solo como ANALISTA.
reset role;
delete from public.user_roles where user_id = :'analyst_id'::uuid and role_code = 'JEFE_TECNICA_CALIDAD';
set local role authenticated;
select tests.set_role_context('ANALISTA', :'analyst_id');
select is(public.void_report(:'report_id'::uuid, 'Error de transcripción en el reporte') ->> 'error_code',
  'INSUFFICIENT_ROLE', 'Un rol no permitido no puede anular');

select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'other_lead_id');
select is(public.void_report(:'report_id'::uuid, 'Error de transcripción en el reporte') ->> 'ok',
  'true', 'Un JTC distinto del preparador anula el reporte');

reset role;
select ok((select status = 'VOIDED' and voided_by = :'other_lead_id'::uuid and voided_at is not null
             and void_reason = 'Error de transcripción en el reporte' and code = :'report_code'
           from public.reports where id = :'report_id'::uuid),
  'El reporte queda VOIDED con quién, cuándo, motivo y conserva su número');
select ok(exists (select 1 from public.report_snapshots where report_id = :'report_id'::uuid),
  'El snapshot de emisión se conserva');
select ok(exists (select 1 from public.audit_logs where action = 'REPORT_VOIDED'
                   and entity_id = :'report_id'::uuid and reason = 'Error de transcripción en el reporte'),
  'La anulación queda auditada con su motivo');
select is((select count(*)::int from public.audit_logs where action = 'REPORT_VOID_DENIED'
            and entity_id = :'report_id'::uuid), 2,
  'Los intentos denegados por rol y segregación quedan auditados');

set local role authenticated;
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'other_lead_id');
select is(public.void_report(:'report_id'::uuid, 'Segundo intento de anulación') ->> 'error_code',
  'INVALID_STATUS', 'Un reporte anulado no se anula dos veces');
select throws_ok(
  format('update public.reports set status = %L where id = %L::uuid', 'ISSUED', :'report_id'),
  '42501', null,
  'Un cliente no puede revertir la anulación con un UPDATE directo');

select * from finish();
rollback;
