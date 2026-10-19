alter table public.external_shipment_tests
  drop constraint external_shipment_tests_sample_test_id_key,
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references public.profiles(id) on delete restrict,
  add constraint external_shipment_tests_sample_test_fkey
    foreign key (sample_test_id) references public.sample_tests(id) on delete restrict;

alter table public.external_shipments
  add constraint external_shipments_report_receipt_check
    check (
      (status = 'REPORT_RECEIVED' and report_received_at is not null and received_by is not null)
      or
      (status <> 'REPORT_RECEIVED' and report_received_at is null and received_by is null)
    );

create trigger external_shipments_set_audit_columns
  before insert or update on public.external_shipments
  for each row execute function public.set_catalog_audit_columns();

create trigger external_shipment_tests_set_audit_columns
  before insert or update on public.external_shipment_tests
  for each row execute function public.set_catalog_audit_columns();

create or replace function public.audit_external_shipment_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public.log_audit(
    case
      when tg_op = 'INSERT' then 'EXTERNAL_SHIPMENT_CREATED'
      when old.status is distinct from new.status then 'EXTERNAL_SHIPMENT_STATUS_CHANGED'
      else 'EXTERNAL_SHIPMENT_UPDATED'
    end,
    'EXTERNAL_SHIPMENT',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger external_shipments_audit_change
  after insert or update on public.external_shipments
  for each row execute function public.audit_external_shipment_change();

create or replace function public.audit_external_shipment_test_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public.log_audit(
    'EXTERNAL_SHIPMENT_TEST_ATTACHED',
    'EXTERNAL_SHIPMENT_TEST',
    new.id,
    null,
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger external_shipment_tests_audit_change
  after insert on public.external_shipment_tests
  for each row execute function public.audit_external_shipment_test_change();

create or replace function public.validate_external_shipment_test()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  shipment_row public.external_shipments%rowtype;
  sample_test_row public.sample_tests%rowtype;
begin
  select shipment.*
    into shipment_row
    from public.external_shipments as shipment
   where shipment.id = new.shipment_id;
  if not found or shipment_row.status = 'CANCELLED' then
    raise exception using errcode = '22023', message = 'No se puede vincular un ensayo a un envío inexistente o cancelado.';
  end if;

  select sample_test.*
    into sample_test_row
    from public.sample_tests as sample_test
   where sample_test.id = new.sample_test_id
   for update;
  if not found
    or sample_test_row.sample_id <> shipment_row.sample_id
    or sample_test_row.execution_type <> 'SUBCONTRACTED'
    or (
      sample_test_row.assigned_laboratory_id is not null
      and sample_test_row.assigned_laboratory_id <> shipment_row.laboratory_id
    ) then
    raise exception using errcode = '22023', message = 'El ensayo no corresponde a esta muestra y laboratorio subcontratado.';
  end if;

  if exists (
    select 1
      from public.external_shipment_tests as link
      join public.external_shipments as other_shipment on other_shipment.id = link.shipment_id
     where link.sample_test_id = new.sample_test_id
       and other_shipment.status not in ('REPORT_RECEIVED', 'CANCELLED')
  ) then
    raise exception using errcode = '23505', message = 'Un ensayo subcontratado solo puede estar en un envío activo.';
  end if;
  return new;
end;
$$;

create trigger external_shipment_tests_validate
  before insert on public.external_shipment_tests
  for each row execute function public.validate_external_shipment_test();

create or replace view public.v_pending_external_reports
with (security_invoker = true)
as
select
  shipment.id as shipment_id,
  shipment.sample_id,
  shipment.laboratory_id,
  laboratory.name as laboratory_name,
  shipment.external_code,
  shipment.sent_at,
  shipment.expected_at,
  shipment.status,
  case
    when shipment.expected_at is null then null
    else greatest(current_date - shipment.expected_at::date, 0)
  end as days_overdue,
  shipment.observations,
  sample.code as sample_code,
  sample.client_id,
  client.business_name as client_name,
  sample.sampling_point
from public.external_shipments as shipment
join public.samples as sample on sample.id = shipment.sample_id
join public.clients as client on client.id = sample.client_id
join public.laboratories as laboratory on laboratory.id = shipment.laboratory_id
where shipment.status not in ('REPORT_RECEIVED', 'CANCELLED');

create or replace function public.sample_has_pending_external_reports(p_sample_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_user_is_active()
    and public.has_any_role(array[
      'RECEPCION', 'ANALISTA', 'ADMIN', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'
    ])
    and exists (
      select 1
        from public.external_shipments as shipment
       where shipment.sample_id = p_sample_id
         and shipment.status not in ('REPORT_RECEIVED', 'CANCELLED')
    );
$$;

create or replace function public.create_external_shipment(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  target_sample_id uuid;
  target_laboratory_id uuid;
  target_external_code text;
  target_sent_at timestamptz;
  target_expected_at timestamptz;
  target_observations text;
  sample_test_ids uuid[];
  selected_test uuid;
  selected_sample_test public.sample_tests%rowtype;
  selected_lab public.laboratories%rowtype;
  shipment_id uuid;
  analysis_date date;
  accreditation_valid boolean;
  warning_list jsonb := '[]'::jsonb;
  test_code text;
  input_test_count integer;
begin
  if auth.uid() is null
    or not public.has_any_role(array['RECEPCION', 'ANALISTA', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Se requiere RECEPCION, ANALISTA o ADMIN activo.';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or jsonb_typeof(payload -> 'sample_test_ids') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Los datos del envío no son válidos.';
  end if;

  target_sample_id := nullif(payload ->> 'sample_id', '')::uuid;
  target_laboratory_id := nullif(payload ->> 'laboratory_id', '')::uuid;
  target_external_code := nullif(btrim(payload ->> 'external_code'), '');
  target_sent_at := nullif(payload ->> 'sent_at', '')::timestamptz;
  target_expected_at := nullif(payload ->> 'expected_at', '')::timestamptz;
  target_observations := nullif(btrim(payload ->> 'observations'), '');

  if target_sample_id is null or target_laboratory_id is null then
    raise exception using errcode = '22023', message = 'Muestra y laboratorio son obligatorios.';
  end if;
  if target_expected_at is null then
    raise exception using errcode = '22023', message = 'La fecha esperada debe ingresarse manualmente.';
  end if;

  select laboratory.*
    into selected_lab
    from public.laboratories as laboratory
   where laboratory.id = target_laboratory_id
     and laboratory.active
     and laboratory.laboratory_type = 'EXTERNAL';
  if not found then
    raise exception using errcode = '22023', message = 'Seleccione un laboratorio externo activo.';
  end if;
  if not exists (select 1 from public.samples where id = target_sample_id) then
    raise exception using errcode = 'P0002', message = 'No se encontró la muestra.';
  end if;

  select coalesce(array_agg(distinct value::uuid), '{}'::uuid[])
    into sample_test_ids
    from jsonb_array_elements_text(payload -> 'sample_test_ids') as tests(value);
  select count(*) into input_test_count
    from jsonb_array_elements_text(payload -> 'sample_test_ids') as tests(value);
  if coalesce(cardinality(sample_test_ids), 0) = 0
    or cardinality(sample_test_ids) <> input_test_count then
    raise exception using errcode = '22023', message = 'Seleccione uno o más ensayos, sin duplicarlos.';
  end if;

  foreach selected_test in array sample_test_ids
  loop
    select sample_test.*
      into selected_sample_test
      from public.sample_tests as sample_test
     where sample_test.id = selected_test
     for update;
    if not found
      or selected_sample_test.sample_id <> target_sample_id
      or selected_sample_test.execution_type <> 'SUBCONTRACTED'
      or (
        selected_sample_test.assigned_laboratory_id is not null
        and selected_sample_test.assigned_laboratory_id <> target_laboratory_id
      ) then
      raise exception using errcode = '22023', message = 'Todos los ensayos deben ser subcontratados de la muestra y laboratorio seleccionados.';
    end if;
    if exists (
      select 1
        from public.external_shipment_tests as attached
        join public.external_shipments as attached_shipment
          on attached_shipment.id = attached.shipment_id
       where attached.sample_test_id = selected_test
         and attached_shipment.status not in ('REPORT_RECEIVED', 'CANCELLED')
    ) then
      raise exception using errcode = '23505', message = 'Un ensayo subcontratado solo puede estar en un envío activo.';
    end if;

    select test.code
      into test_code
      from public.tests as test
     where test.id = selected_sample_test.test_id;
    select result.analysis_start::date
      into analysis_date
      from public.results as result
     where result.sample_id = target_sample_id
       and result.test_id = selected_sample_test.test_id
       and result.laboratory_id = target_laboratory_id
       and result.analysis_start is not null
     order by result.analysis_start desc
     limit 1;

    if analysis_date is null then
      warning_list := warning_list || jsonb_build_array(jsonb_build_object(
        'sample_test_id', selected_test,
        'test_code', test_code,
        'message', 'Aún no hay fecha de análisis registrada para verificar la vigencia del alcance.'
      ));
    else
      select exists (
        select 1
          from public.laboratory_accreditations as accreditation
          join public.laboratory_accredited_tests as accredited_test
            on accredited_test.accreditation_id = accreditation.id
         where accreditation.laboratory_id = target_laboratory_id
           and accreditation.active
           and accredited_test.active
           and accredited_test.test_id = selected_sample_test.test_id
           and (accreditation.valid_from is null or accreditation.valid_from <= analysis_date)
           and (accreditation.valid_until is null or accreditation.valid_until >= analysis_date)
      ) into accreditation_valid;
      if not accreditation_valid then
        warning_list := warning_list || jsonb_build_array(jsonb_build_object(
          'sample_test_id', selected_test,
          'test_code', test_code,
          'analysis_date', analysis_date,
          'message', 'El ensayo no aparece en el alcance acreditado vigente del laboratorio a la fecha de análisis.'
        ));
      end if;
    end if;
  end loop;

  insert into public.external_shipments (
    sample_id,
    laboratory_id,
    external_code,
    sent_at,
    expected_at,
    status,
    observations,
    created_by,
    updated_by
  )
  values (
    target_sample_id,
    target_laboratory_id,
    target_external_code,
    target_sent_at,
    target_expected_at,
    case when target_sent_at is null then 'PENDING_SEND' else 'SENT' end,
    target_observations,
    auth.uid(),
    auth.uid()
  )
  returning id into shipment_id;

  insert into public.external_shipment_tests (shipment_id, sample_test_id, created_by, updated_by)
  select shipment_id, unnest(sample_test_ids), auth.uid(), auth.uid();

  return jsonb_build_object(
    'ok', true,
    'shipment_id', shipment_id,
    'status', case when target_sent_at is null then 'PENDING_SEND' else 'SENT' end,
    'accreditation_warnings', warning_list
  );
end;
$$;

create or replace function public.receive_external_report(
  target_shipment_id uuid,
  actual_received_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  previous_row public.external_shipments%rowtype;
begin
  if auth.uid() is null
    or not public.has_any_role(array['RECEPCION', 'ANALISTA', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Se requiere RECEPCION, ANALISTA o ADMIN activo.';
  end if;
  if target_shipment_id is null or actual_received_at is null then
    raise exception using errcode = '22023', message = 'Envío y fecha real de recepción son obligatorios.';
  end if;

  select shipment.*
    into previous_row
    from public.external_shipments as shipment
   where shipment.id = target_shipment_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró el envío.';
  end if;
  if previous_row.status in ('REPORT_RECEIVED', 'CANCELLED') then
    raise exception using errcode = '22023', message = 'El envío ya recibió un reporte o fue cancelado.';
  end if;

  update public.external_shipments
     set report_received_at = actual_received_at,
         received_by = auth.uid(),
         status = 'REPORT_RECEIVED',
         updated_by = auth.uid()
   where id = target_shipment_id;

  return jsonb_build_object('ok', true, 'shipment_id', target_shipment_id);
end;
$$;

create or replace function public.cancel_external_shipment(
  target_shipment_id uuid,
  cancellation_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  old_row public.external_shipments%rowtype;
begin
  if auth.uid() is null
    or not public.has_any_role(array['RECEPCION', 'ANALISTA', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Se requiere RECEPCION, ANALISTA o ADMIN activo.';
  end if;
  if nullif(btrim(cancellation_reason), '') is null then
    raise exception using errcode = '22023', message = 'El motivo de cancelación es obligatorio.';
  end if;

  select shipment.*
    into old_row
    from public.external_shipments as shipment
   where shipment.id = target_shipment_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró el envío.';
  end if;
  if old_row.status = 'REPORT_RECEIVED' or old_row.status = 'CANCELLED' then
    raise exception using errcode = '22023', message = 'El envío ya está cerrado.';
  end if;

  update public.external_shipments
     set status = 'CANCELLED',
         observations = concat_ws(E'\n', observations, 'Cancelación: ' || btrim(cancellation_reason)),
         updated_by = auth.uid()
   where id = target_shipment_id;

  return jsonb_build_object('ok', true, 'shipment_id', target_shipment_id);
end;
$$;

drop policy if exists "ext_shipments: write" on public.external_shipments;
drop policy if exists "ext_shipments: update" on public.external_shipments;
drop policy if exists "ext_shipments: read" on public.external_shipments;
drop policy if exists "ext_shipment_tests: write" on public.external_shipment_tests;
drop policy if exists "ext_shipment_tests: read" on public.external_shipment_tests;

create policy external_shipments_read
  on public.external_shipments for select to authenticated
  using (public.has_any_role(array[
    'RECEPCION', 'ANALISTA', 'ADMIN', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'
  ]));
create policy external_shipment_tests_read
  on public.external_shipment_tests for select to authenticated
  using (
    public.has_any_role(array[
      'RECEPCION', 'ANALISTA', 'ADMIN', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'
    ])
  );

revoke all on public.external_shipments, public.external_shipment_tests
  from anon, authenticated;
grant select on public.external_shipments, public.external_shipment_tests
  to authenticated;
grant select on public.v_pending_external_reports to authenticated;

revoke all on function public.audit_external_shipment_change()
  from public, anon, authenticated;
revoke all on function public.audit_external_shipment_test_change()
  from public, anon, authenticated;
revoke all on function public.validate_external_shipment_test()
  from public, anon, authenticated;
revoke all on function public.create_external_shipment(jsonb)
  from public, anon, authenticated;
revoke all on function public.receive_external_report(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.cancel_external_shipment(uuid, text)
  from public, anon, authenticated;
revoke all on function public.sample_has_pending_external_reports(uuid)
  from public, anon, authenticated;

grant execute on function public.create_external_shipment(jsonb) to authenticated;
grant execute on function public.receive_external_report(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_external_shipment(uuid, text) to authenticated;
grant execute on function public.sample_has_pending_external_reports(uuid) to authenticated;
