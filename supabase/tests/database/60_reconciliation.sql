-- p08: detección segura, resolución auditada y permisos de conciliación.
begin;

select plan(9);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.reconciliation_issues'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.reconciliation_decisions'::regclass)
  and not has_table_privilege('authenticated', 'public.reconciliation_issues', 'INSERT')
  and not has_table_privilege('authenticated', 'public.reconciliation_issues', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.reconciliation_decisions', 'INSERT'),
  'Los issues y decisiones tienen RLS y no permiten escritura directa'
);

select is(
  public.try_parse_reconciliation_date('2026-05-29'),
  date '2026-05-29',
  'La fecha ISO se interpreta sin cambiar el día'
);

select is(
  public.try_parse_reconciliation_date('2026-02-31'),
  null::date,
  'Una fecha externa inválida no aborta la detección'
);

select tests.create_test_user('ANALISTA') as analyst_id \gset
select tests.create_test_user('JEFE_TECNICA_CALIDAD') as quality_lead_id \gset
select tests.create_test_user('ADMIN_TECNICO') as technical_admin_id \gset

insert into public.clients (id, business_name, active, created_by, updated_by)
values (
  '60000000-0000-0000-0000-000000000001',
  'Cliente prueba p08',
  true,
  :'analyst_id',
  :'analyst_id'
);

insert into public.samples (id, code, client_id, sampled_at, created_by, updated_by)
values (
  '60000000-0000-0000-0000-000000000002',
  'AG6001',
  '60000000-0000-0000-0000-000000000001',
  '2026-05-29T00:00:00Z',
  :'analyst_id',
  :'analyst_id'
);

insert into public.tests (id, code, parameter_name, active, created_by, updated_by)
values (
  '60000000-0000-0000-0000-000000000003',
  'SA-P08-AOX',
  'AOX',
  true,
  :'analyst_id',
  :'analyst_id'
);

insert into public.sample_tests (
  id, sample_id, test_id, execution_type, created_by, updated_by
)
values (
  '60000000-0000-0000-0000-000000000004',
  '60000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-000000000003',
  'SA',
  :'analyst_id',
  :'analyst_id'
);

insert into public.reconciliation_issues (
  id, sample_id, issue_type, field_name, entity_type, entity_id,
  source_a, value_a, source_b, value_b, created_by, updated_by
)
values
  (
    '60000000-0000-0000-0000-000000000005',
    '60000000-0000-0000-0000-000000000002',
    'DATE_MISMATCH',
    'sampling_date',
    'SAMPLE',
    '60000000-0000-0000-0000-000000000002',
    'Recepción',
    '2026-05-29T00:00:00+00:00',
    'Fuente externa',
    '2026-05-26T00:00:00+00:00',
    :'analyst_id',
    :'analyst_id'
  ),
  (
    '60000000-0000-0000-0000-000000000006',
    '60000000-0000-0000-0000-000000000002',
    'INCOMPLETE_TEST_FIELDS',
    'test_fields',
    'TEST',
    '60000000-0000-0000-0000-000000000003',
    'Catálogo',
    'SA-P08-AOX',
    'Campos faltantes',
    'Unidad, método y técnica',
    :'analyst_id',
    :'analyst_id'
  );

select tests.set_role_context('ANALISTA', :'analyst_id'::uuid);

select throws_ok(
  $$select public.resolve_reconciliation_issue(
    '60000000-0000-0000-0000-000000000005',
    'ACCEPT_B',
    'Fuente externa',
    '2026-05-26T00:00:00+00:00',
    ' ',
    null
  )$$,
  '22023',
  'No se registra una decisión sin motivo'
);

select is(
  public.resolve_reconciliation_issue(
    '60000000-0000-0000-0000-000000000005',
    'ACCEPT_B',
    'Fuente externa',
    '2026-05-26T00:00:00+00:00',
    'Se validó contra el informe original',
    null
  ) ->> 'status',
  'RESOLVED',
  'La decisión con motivo resuelve el issue'
);

reset role;

select ok(
  (select sampled_at::date = date '2026-05-26'
     from public.samples
    where id = '60000000-0000-0000-0000-000000000002')
  and exists (
    select 1
      from public.audit_logs
     where action = 'SAMPLE_DATE_CORRECTED_BY_RECONCILIATION'
       and entity_id = '60000000-0000-0000-0000-000000000002'
       and user_id = :'analyst_id'::uuid
       and reason = 'Se validó contra el informe original'
       and old_data ->> 'sampled_at' like '2026-05-29%'
       and new_data ->> 'sampled_at' like '2026-05-26%'
  ),
  'El cambio de fecha conserva old/new, usuario y motivo en auditoría'
);

select tests.set_role_context('ANALISTA', :'analyst_id'::uuid);

select throws_ok(
  $$select public.resolve_reconciliation_issue(
    '60000000-0000-0000-0000-000000000006',
    'ACCEPT_A',
    'Catálogo',
    'SA-P08-AOX',
    'Intento de liberar AOX incompleto',
    null
  )$$,
  '22023',
  'AOX no se libera mientras la ficha técnica esté incompleta'
);

select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'quality_lead_id'::uuid);

select is(
  public.resolve_reconciliation_issue(
    '60000000-0000-0000-0000-000000000006',
    'REQUEST_REVIEW',
    null,
    null,
    'Completar ficha técnica antes de resolver',
    null
  ) ->> 'status',
  'OPEN',
  'JEFE_TECNICA_CALIDAD puede solicitar revisión sin cerrar el issue'
);

select tests.set_role_context('ADMIN_TECNICO', :'technical_admin_id'::uuid);

select throws_ok(
  $$select public.resolve_reconciliation_issue(
    '60000000-0000-0000-0000-000000000006',
    'REQUEST_REVIEW',
    null,
    null,
    'Intento desde soporte técnico',
    null
  )$$,
  '42501',
  'ADMIN_TECNICO no puede solicitar ni resolver decisiones'
);

select * from finish();
rollback;
