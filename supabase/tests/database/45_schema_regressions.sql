-- Regresiones de la migración 20261123110000: inserción de resultados,
-- run_validations y guarda del estado de reportes.
\ir 000_helpers.psql
begin;
select plan(9);
select tests.authenticate_fixture_admin() as fixture_admin_id \gset

select tests.create_test_user('ANALISTA') as analyst_id \gset
select tests.create_test_user('ADMIN') as admin_id \gset

insert into public.clients (id, business_name, active)
values ('45000000-0000-0000-0000-000000000001', 'Cliente regresiones', true);
insert into public.samples (id, code, client_id, status)
values ('45000000-0000-0000-0000-000000000002', 'AG4502', '45000000-0000-0000-0000-000000000001', 'RECEIVED');
select id as test_id from public.tests where active order by code limit 1 \gset
select id as lab_id from public.laboratories order by id limit 1 \gset

-- 1. Insertar un resultado ya no rompe el trigger de auditoría.
select lives_ok(
  format(
    'insert into public.results (sample_id, test_id, laboratory_id, entry_mechanism, entered_by)
     values (%L::uuid, %L::uuid, %L::uuid, %L, %L::uuid)',
    '45000000-0000-0000-0000-000000000002', :'test_id', :'lab_id', 'MANUAL', :'fixture_admin_id'
  ),
  'Se puede insertar un resultado'
);
select ok(
  exists (
    select 1 from public.audit_logs al
    join public.results r on r.id = al.entity_id
    where al.action = 'RESULT_CREATED' and r.sample_id = '45000000-0000-0000-0000-000000000002'
  ),
  'La creación del resultado queda auditada como RESULT_CREATED'
);

-- 2. run_validations ejecuta las reglas activas sin error de SQL dinámico.
select tests.set_role_context('ANALISTA', :'analyst_id');
set local role authenticated;
select public.run_validations('SAMPLE', '45000000-0000-0000-0000-000000000002') as run_id \gset
reset role;
select is(
  (select status from public.validation_runs where id = :'run_id'::uuid),
  'COMPLETED',
  'run_validations completa con las reglas activas de la semilla'
);
select ok(
  exists (select 1 from public.validation_issues where validation_run_id = :'run_id'::uuid),
  'run_validations registra los hallazgos de los validadores'
);

-- 3. Estado de reportes: solo las funciones del sistema lo cambian.
select tests.set_role_context('ANALISTA', :'analyst_id');
set local role authenticated;
insert into public.reports (prepared_by, status, client_id, created_by, updated_by)
values (:'analyst_id'::uuid, 'DRAFT', '45000000-0000-0000-0000-000000000001',
        :'analyst_id'::uuid, :'analyst_id'::uuid)
returning id as report_id \gset

select throws_ok(
  format('update public.reports set status = %L where id = %L::uuid', 'VALIDATING', :'report_id'),
  '42501', null,
  'El preparador no puede cambiar el estado con un UPDATE directo'
);

select tests.set_role_context('ADMIN', :'admin_id');
select throws_ok(
  format('update public.reports set status = %L where id = %L::uuid', 'VALIDATING', :'report_id'),
  '42501', null,
  'ADMIN tampoco puede cambiar el estado con un UPDATE directo'
);

-- Defensa en profundidad: aunque se devolviera el privilegio UPDATE, el trigger
-- sigue rechazando el cambio directo de estado.
reset role;
grant update on public.reports to authenticated;
select tests.set_role_context('ANALISTA', :'analyst_id');
set local role authenticated;
select throws_ok(
  format('update public.reports set status = %L where id = %L::uuid', 'VALIDATING', :'report_id'),
  '42501',
  'El estado del reporte solo puede cambiarse mediante transition_report o issue_report.',
  'El trigger rechaza el UPDATE directo de estado aunque exista el privilegio'
);
reset role;
revoke update on public.reports from authenticated;

select tests.set_role_context('ANALISTA', :'analyst_id');
set local role authenticated;
select is(
  public.transition_report(:'report_id'::uuid, 'VALIDATING', null) ->> 'ok',
  'true',
  'transition_report sí cambia el estado'
);
select is(
  (select status from public.reports where id = :'report_id'::uuid),
  'VALIDATING',
  'El reporte queda en el estado de la transición'
);

select * from finish();
rollback;
