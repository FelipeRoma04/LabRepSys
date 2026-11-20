-- K03: template approval denial and audit, immutable approved config, new version.
begin;

\ir helpers.sql

select plan(8);
select tests.create_test_user('ADMIN') as admin_id \gset
select tests.create_test_user('ANALISTA') as analyst_id \gset
select tests.create_test_user('JEFE_TECNICA_CALIDAD') as jtc_id \gset

insert into public.report_templates (code, version, status, configuration, created_by, updated_by)
values ('K03-TEST', 1, 'DRAFT', '{"schemaVersion":1}'::jsonb, :'admin_id'::uuid, :'admin_id'::uuid)
returning id as template_id \gset

select set_config('request.jwt.claims', json_build_object('sub', :'analyst_id', 'role', 'authenticated')::text, true);
set local role authenticated;
select is(
  public.approve_template(:'template_id'::uuid)->>'ok',
  'false',
  'ANALISTA cannot approve a template'
);
select ok(
  exists (select 1 from public.audit_logs where action = 'APPROVE_TEMPLATE_DENIED' and entity_id = :'template_id'::uuid),
  'denied approval is audited'
);

select set_config('request.jwt.claims', json_build_object('sub', :'jtc_id', 'role', 'authenticated')::text, true);
select is(public.approve_template(:'template_id'::uuid)->>'ok', 'true', 'JTC approves the draft');
select is(
  (select status from public.report_templates where id = :'template_id'::uuid),
  'APPROVED',
  'approved template records its state'
);
select throws_ok(
  format('update public.report_templates set configuration = %L::jsonb where id = %L::uuid', '{"schemaVersion":1,"changed":true}', :'template_id'),
  '42501',
  'Una plantilla APPROVED es inmutable. Crea una nueva versión para modificarla.',
  'approved configuration cannot be edited'
);

select set_config('request.jwt.claims', json_build_object('sub', :'admin_id', 'role', 'authenticated')::text, true);
select is(public.new_template_version(:'template_id'::uuid)->>'ok', 'true', 'ADMIN creates a new draft version');
select is(
  (select version::text || ':' || status from public.report_templates where code = 'K03-TEST' and version = 2),
  '2:DRAFT',
  'new version increments version and starts as DRAFT'
);
select ok(
  exists (select 1 from public.audit_logs where action = 'NEW_TEMPLATE_VERSION' and entity_type = 'REPORT_TEMPLATE'),
  'new version creation is audited'
);

select * from finish();
rollback;
