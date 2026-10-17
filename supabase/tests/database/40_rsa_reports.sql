-- K02: Pruebas de segregación, emisión e inmutabilidad del RSA
-- Req 3.6 (transition_report/issue_report devuelven {ok:false} y auditan),
-- Req 3.7 (reporte emitido, snapshot y filas relacionadas son inmutables)

begin;

-- Verificar que existen las tablas del módulo RSA
do $
begin
  if to_regclass('public.reports') is null then
    raise notice 'SKIP: módulo RSA no existe aún';
  end if;
end;
$;

select case
  when to_regclass('public.reports') is not null then 7
  else 0
end tests_count \gset

select plan(:tests_count);

-- Salir temprano si el módulo no existe
do $
begin
  if to_regclass('public.reports') is null then
    perform skip(7, 'Módulo RSA no existe aún');
    return;
  end if;
end;
$;

-- ── Crear usuarios de prueba ─────────────────────────────────────────────────
select tests.create_test_user('ADMIN')                as admin_id \gset
select tests.create_test_user('ANALISTA')             as analista_id \gset
select tests.create_test_user('JEFE_TECNICA_CALIDAD') as jtc_id \gset

-- ── Crear un reporte borrador como ANALISTA ──────────────────────────────────
select tests.set_role_context('ANALISTA', :'analista_id');

insert into public.reports (prepared_by, status, created_by, updated_by)
values (:'analista_id'::uuid, 'DRAFT', :'analista_id'::uuid, :'analista_id'::uuid)
returning id as report_id \gset

-- ── Test 1: Analista no puede hacer transición directa a IN_REVIEW ───────────
-- Req 3.6
select is(
  (
    select (public.transition_report(:'report_id'::uuid, 'IN_REVIEW', null)) ->> 'ok'
  ),
  'false',
  'ANALISTA no puede mover el reporte a IN_REVIEW directamente'
);

-- ── Test 2: Intento denegado queda registrado en audit_logs ─────────────────
-- Req 3.6
select ok(
  (
    select count(*) > 0 from public.audit_logs
    where action like '%DENIED%'
      and entity_type = 'REPORT'
      and entity_id = :'report_id'::uuid
  ),
  'Los intentos denegados quedan registrados en audit_logs'
);

-- ── Test 3: Preparador del reporte no puede aprobarlo ───────────────────────
-- Req 3.6 — segregación: quien prepara no aprueba aunque tenga rol JTC
-- Forzar al analista al rol JTC temporalmente para verificar la segregación
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'analista_id');

-- Avanzar el reporte hasta APPROVED usando el JTC real
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'jtc_id');
-- Llevar el reporte de DRAFT a APPROVED paso a paso
select public.transition_report(:'report_id'::uuid, 'VALIDATING');
select public.transition_report(:'report_id'::uuid, 'READY_FOR_REVIEW');
select public.transition_report(:'report_id'::uuid, 'IN_REVIEW');
select public.transition_report(:'report_id'::uuid, 'APPROVED');

-- Ahora intentar aprobar como el preparador (analista_id tiene prepared_by)
-- Simular que el analista_id también tiene rol JTC (caso edge)
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'analista_id');

select is(
  (
    select (public.issue_report(:'report_id'::uuid)) ->> 'ok'
  ),
  'false',
  'El preparador del reporte no puede emitirlo (segregación)'
);

-- ── Test 4: JTC puede emitir el reporte ─────────────────────────────────────
-- Req 3.6 — flujo correcto con JTC real
select tests.set_role_context('JEFE_TECNICA_CALIDAD', :'jtc_id');

select is(
  (
    select (public.issue_report(:'report_id'::uuid)) ->> 'ok'
  ),
  'true',
  'JEFE_TECNICA_CALIDAD puede emitir el reporte correctamente'
);

-- ── Test 5: Reporte emitido tiene código RSA asignado ────────────────────────
select ok(
  (select code ~ '^RSA-[0-9]+-[0-9]{4}
 from public.reports where id = :'report_id'::uuid),
  'El reporte emitido tiene código RSA con formato correcto'
);

-- ── Test 6: No se puede modificar una fila de report_samples de reporte emitido
-- Req 3.7
select throws_ok(
  format(
    $q$
      insert into public.report_samples (report_id, sample_id)
      values (%L::uuid, gen_random_uuid())
    $q$,
    :'report_id'
  ),
  '42501',
  'No se pueden agregar muestras a un reporte ISSUED'
);

-- ── Test 7: El snapshot del reporte emitido no puede modificarse ─────────────
-- Req 3.7 — report_snapshots no tiene UPDATE ni DELETE
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename = 'report_snapshots'
      and cmd in ('UPDATE', 'DELETE')
  ),
  0,
  'report_snapshots no debe tener políticas UPDATE ni DELETE'
);

select * from finish();
rollback;
