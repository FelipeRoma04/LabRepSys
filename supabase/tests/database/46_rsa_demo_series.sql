-- Serie DEMO: los reportes de muestras DEMO no gastan el consecutivo real del RSA.
\ir 000_helpers.psql
begin;
select plan(6);
select tests.authenticate_fixture_admin() as fixture_admin_id \gset

select tests.create_test_user('ANALISTA') as analyst_id \gset
select tests.create_test_user('JEFE_TECNICA_CALIDAD') as quality_lead_id \gset

-- Esta prueba cubre la numeración, no la calidad del catálogo de la semilla.
update public.validation_rules set active = false
 where code in ('VAL_CATALOG_INCOMPLETE', 'VAL_RESULT_UNIT');

insert into public.clients (id, business_name, active)
values ('46000000-0000-0000-0000-000000000001', 'Cliente serie DEMO', true);
insert into public.samples (id, code, client_id, status, sampled_at, received_at, is_demo)
values
  ('46000000-0000-0000-0000-000000000002', 'AG4602', '46000000-0000-0000-0000-000000000001',
   'RECEIVED', now() - interval '2 days', now() - interval '1 day', true),
  ('46000000-0000-0000-0000-000000000003', 'AG4603', '46000000-0000-0000-0000-000000000001',
   'RECEIVED', now() - interval '2 days', now() - interval '1 day', false);

select id as test_id from public.tests where active order by code limit 1 \gset
select id as lab_id from public.laboratories order by id limit 1 \gset
insert into public.report_templates (code, version, status, approved_at, active, created_by, updated_by)
values ('K46-RSA', 1, 'APPROVED', now(), true, :'fixture_admin_id'::uuid, :'fixture_admin_id'::uuid)
returning id as template_id \gset
insert into public.results (sample_id, test_id, laboratory_id, entry_mechanism, entered_by,
  analysis_start, analysis_end, method_text, accreditation_type, status)
values
  ('46000000-0000-0000-0000-000000000002', :'test_id'::uuid, :'lab_id'::uuid, 'MANUAL',
   :'fixture_admin_id'::uuid, current_date - 1, current_date, 'Método K46', 'ACCREDITED', 'CONFIRMED'),
  ('46000000-0000-0000-0000-000000000003', :'test_id'::uuid, :'lab_id'::uuid, 'MANUAL',
   :'fixture_admin_id'::uuid, current_date - 1, current_date, 'Método K46', 'ACCREDITED', 'CONFIRMED');

select coalesce((select last_value from public.document_counters
  where counter_code = 'RSA' and period_year = extract(year from now())::integer), 0) as rsa_before \gset

-- Lleva un reporte de las muestras indicadas hasta APPROVED.
create function pg_temp.approved_report(p_samples uuid[], p_analyst uuid, p_lead uuid, p_template uuid)
returns uuid language plpgsql as $$
declare v_report uuid;
begin
  perform tests.set_role_context('ANALISTA', p_analyst);
  insert into public.reports (prepared_by, status, client_id, template_id, created_by, updated_by)
  values (p_analyst, 'DRAFT', '46000000-0000-0000-0000-000000000001', p_template, p_analyst, p_analyst)
  returning id into v_report;
  insert into public.report_samples (report_id, sample_id) select v_report, unnest(p_samples);
  insert into public.report_results (report_id, result_id)
    select v_report, r.id from public.results r where r.sample_id = any(p_samples);
  perform public.transition_report(v_report, 'VALIDATING', null);
  perform public.transition_report(v_report, 'READY_FOR_REVIEW', null);
  perform tests.set_role_context('JEFE_TECNICA_CALIDAD', p_lead);
  perform public.transition_report(v_report, 'IN_REVIEW', null);
  perform public.transition_report(v_report, 'APPROVED', null);
  return v_report;
end;
$$;

select pg_temp.approved_report(array['46000000-0000-0000-0000-000000000002'::uuid],
  :'analyst_id'::uuid, :'quality_lead_id'::uuid, :'template_id'::uuid) as demo_report \gset
select pg_temp.approved_report(array['46000000-0000-0000-0000-000000000002'::uuid,
  '46000000-0000-0000-0000-000000000003'::uuid],
  :'analyst_id'::uuid, :'quality_lead_id'::uuid, :'template_id'::uuid) as mixed_report \gset

select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'quality_lead_id');
select public.issue_report(:'demo_report'::uuid) ->> 'code' as demo_code \gset

select is(:'demo_code',
  'DEMO-0001-' || extract(year from now())::integer::text,
  'Un reporte de muestras DEMO usa la serie DEMO-NNNN-AAAA');
select ok((select is_demo and status = 'ISSUED' from public.reports where id = :'demo_report'::uuid),
  'El reporte queda emitido y marcado como DEMO');
select ok((select (snapshot_data ->> 'is_demo')::boolean from public.report_snapshots
  where report_id = :'demo_report'::uuid),
  'El snapshot congelado registra que es DEMO');
select is(
  coalesce((select last_value from public.document_counters
    where counter_code = 'RSA' and period_year = extract(year from now())::integer), 0),
  :'rsa_before'::bigint,
  'La emisión DEMO no consume el consecutivo real del RSA');

select is(public.issue_report(:'mixed_report'::uuid) ->> 'error_code', 'MIXED_DEMO_SAMPLES',
  'Un reporte que mezcla muestras DEMO y reales no se emite');
select is((select status from public.reports where id = :'mixed_report'::uuid), 'APPROVED',
  'El reporte mixto sigue aprobado y sin número');

select * from finish();
rollback;
