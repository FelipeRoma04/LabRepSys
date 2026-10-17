create table public.matrices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict
);

create table public.methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  technique text,
  reference text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict
);

create table public.laboratories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  laboratory_type text not null check (laboratory_type in ('INTERNAL', 'EXTERNAL')),
  nit text,
  contact_email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict
);

create table public.laboratory_accreditations (
  id uuid primary key default gen_random_uuid(),
  laboratory_id uuid not null references public.laboratories(id) on delete restrict,
  resolution text,
  valid_from date,
  valid_until date,
  scope_notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  check (valid_from is null or valid_until is null or valid_until >= valid_from)
);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^SA'),
  parameter_name text,
  default_unit text,
  lcm numeric,
  uncertainty_text text,
  accreditation_type text check (
    accreditation_type in ('ACCREDITED', 'NOT_ACCREDITED', 'NOT_APPLICABLE')
  ),
  matrix_id uuid references public.matrices(id) on delete restrict,
  method_id uuid references public.methods(id) on delete restrict,
  technique text,
  laboratory_id uuid references public.laboratories(id) on delete restrict,
  observations text,
  version integer not null default 1 check (version > 0),
  replaces_test_id uuid references public.tests(id) on delete restrict,
  valid_from date,
  valid_until date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  unique (code, version),
  check (valid_from is null or valid_until is null or valid_until >= valid_from)
);

create table public.laboratory_accredited_tests (
  id uuid primary key default gen_random_uuid(),
  accreditation_id uuid not null references public.laboratory_accreditations(id) on delete restrict,
  test_id uuid not null references public.tests(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  unique (accreditation_id, test_id)
);

create table public.test_aliases (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete restrict,
  laboratory_id uuid references public.laboratories(id) on delete restrict,
  alias_type text not null check (alias_type in ('LEGACY_CODE', 'EXTERNAL_NAME')),
  external_code text,
  external_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  check (
    (alias_type = 'LEGACY_CODE' and external_code in ('AGQ', 'CHEM', 'SGI') and external_name is null)
    or
    (alias_type = 'EXTERNAL_NAME' and external_name is not null and btrim(external_name) <> '')
  )
);

create table public.test_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict
);

create table public.test_group_members (
  id uuid primary key default gen_random_uuid(),
  test_group_id uuid not null references public.test_groups(id) on delete restrict,
  test_id uuid not null references public.tests(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  unique (test_group_id, test_id)
);

create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version integer not null check (version > 0),
  approval_date date,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED', 'RETIRED')),
  configuration jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  unique (code, version)
);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict
);

create or replace function public.next_counter(
  counter_code text,
  period_year integer
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  next_value bigint;
begin
  if auth.uid() is null or not public.current_user_is_active() then
    raise exception using errcode = '42501', message = 'Usuario activo requerido';
  end if;
  if counter_code is null or btrim(counter_code) = '' or period_year is null then
    raise exception using errcode = '22023', message = 'Código y año son requeridos';
  end if;

  insert into public.document_counters as counters (
    counter_code,
    period_year,
    last_value
  )
  values ($1, $2, 1)
  on conflict on constraint document_counters_pkey
  do update set last_value = counters.last_value + 1
  returning counters.last_value into next_value;

  return next_value;
end;
$$;

create or replace function public.set_catalog_audit_columns()
returns trigger
language plpgsql
set search_path = pg_catalog, auth
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function public.audit_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  old_row jsonb;
  new_row jsonb;
  action_name text;
  record_id uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new_row := to_jsonb(new);
    record_id := (new_row ->> 'id')::uuid;
    action_name := 'CREATE';
  elsif tg_op = 'UPDATE' then
    old_row := to_jsonb(old);
    new_row := to_jsonb(new);
    record_id := (new_row ->> 'id')::uuid;
    if old_row -> 'active' is distinct from new_row -> 'active' then
      action_name := case when (new_row ->> 'active')::boolean then 'ACTIVATE' else 'DEACTIVATE' end;
    elsif tg_table_name = 'tests' and old_row -> 'valid_until' is distinct from new_row -> 'valid_until' then
      action_name := 'VERSION_CHANGE';
    else
      action_name := 'UPDATE';
    end if;
  else
    raise exception 'Hard delete is not supported for catalog records';
  end if;

  perform public.log_audit(action_name, upper(tg_table_name), record_id, old_row, new_row);
  if tg_op = 'INSERT' then
    return new;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_test_technical_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if row(
    old.code, old.parameter_name, old.default_unit, old.lcm,
    old.uncertainty_text, old.accreditation_type, old.matrix_id,
    old.method_id, old.technique, old.laboratory_id, old.observations,
    old.version, old.replaces_test_id, old.valid_from
  ) is distinct from row(
    new.code, new.parameter_name, new.default_unit, new.lcm,
    new.uncertainty_text, new.accreditation_type, new.matrix_id,
    new.method_id, new.technique, new.laboratory_id, new.observations,
    new.version, new.replaces_test_id, new.valid_from
  ) then
    raise exception using errcode = '42501', message = 'Los cambios técnicos requieren crear una nueva versión.';
  end if;
  return new;
end;
$$;

create trigger tests_prevent_technical_update
before update on public.tests
for each row execute function public.prevent_test_technical_update();

create or replace function public.create_test_version(
  target_test_id uuid,
  changes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  current_test public.tests%rowtype;
  new_test_id uuid;
  effective_from date;
begin
  if not public.has_role('ADMIN') then
    raise exception using errcode = '42501', message = 'Se requiere rol ADMIN.';
  end if;
  if changes is null or jsonb_typeof(changes) <> 'object' then
    raise exception using errcode = '22023', message = 'Los cambios deben ser un objeto JSON.';
  end if;
  if exists (
    select 1 from jsonb_object_keys(changes) as keys(key_name)
    where key_name not in (
      'parameter_name', 'default_unit', 'lcm', 'uncertainty_text',
      'accreditation_type', 'matrix_id', 'method_id', 'technique',
      'laboratory_id', 'observations', 'valid_from'
    )
  ) then
    raise exception using errcode = '22023', message = 'La versión contiene campos no permitidos.';
  end if;

  select * into current_test
  from public.tests
  where id = target_test_id and active
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró el ensayo activo.';
  end if;

  effective_from := nullif(changes ->> 'valid_from', '')::date;
  if effective_from is null or (current_test.valid_from is not null and effective_from <= current_test.valid_from) then
    raise exception using errcode = '22023', message = 'La fecha de vigencia debe ser posterior a la versión actual.';
  end if;

  insert into public.tests (
    code, parameter_name, default_unit, lcm, uncertainty_text,
    accreditation_type, matrix_id, method_id, technique, laboratory_id,
    observations, version, replaces_test_id, valid_from, active, created_by, updated_by
  )
  values (
    current_test.code,
    case when changes ? 'parameter_name' then changes ->> 'parameter_name' else current_test.parameter_name end,
    case when changes ? 'default_unit' then changes ->> 'default_unit' else current_test.default_unit end,
    case when changes ? 'lcm' then nullif(changes ->> 'lcm', '')::numeric else current_test.lcm end,
    case when changes ? 'uncertainty_text' then changes ->> 'uncertainty_text' else current_test.uncertainty_text end,
    case when changes ? 'accreditation_type' then changes ->> 'accreditation_type' else current_test.accreditation_type end,
    case when changes ? 'matrix_id' then nullif(changes ->> 'matrix_id', '')::uuid else current_test.matrix_id end,
    case when changes ? 'method_id' then nullif(changes ->> 'method_id', '')::uuid else current_test.method_id end,
    case when changes ? 'technique' then changes ->> 'technique' else current_test.technique end,
    case when changes ? 'laboratory_id' then nullif(changes ->> 'laboratory_id', '')::uuid else current_test.laboratory_id end,
    case when changes ? 'observations' then changes ->> 'observations' else current_test.observations end,
    current_test.version + 1,
    current_test.id,
    effective_from,
    true,
    auth.uid(),
    auth.uid()
  )
  returning id into new_test_id;

  update public.tests as previous_version
  set valid_until = least(
    coalesce(previous_version.valid_until, effective_from - 1),
    effective_from - 1
  )
  where previous_version.id = current_test.id;

  perform public.log_audit(
    'VERSION_CHANGE',
    'TEST',
    new_test_id,
    to_jsonb(current_test),
    (select to_jsonb(t) from public.tests t where t.id = new_test_id)
  );
  return new_test_id;
end;
$$;

create trigger tests_set_audit_columns
before insert or update on public.tests
for each row execute function public.set_catalog_audit_columns();

create trigger tests_set_updated_at
before update on public.tests
for each row execute function public.set_updated_at();

create trigger tests_audit_changes
after insert or update on public.tests
for each row execute function public.audit_catalog_change();

create or replace function public.apply_catalog_triggers(table_name text)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
  execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_catalog_audit_columns()', table_name || '_set_audit_columns', table_name);
  execute format('create trigger %I after insert or update on public.%I for each row execute function public.audit_catalog_change()', table_name || '_audit_changes', table_name);
end;
$$;

select public.apply_catalog_triggers(name)
from unnest(array[
  'matrices', 'methods', 'laboratories', 'laboratory_accreditations',
  'laboratory_accredited_tests', 'test_aliases', 'test_groups',
  'test_group_members', 'report_templates', 'holidays'
]) as name;

create or replace view public.v_test_execution_classification
with (security_invoker = true)
as
select
  t.id as test_id,
  case
    when l.laboratory_type = 'EXTERNAL' and exists (
      select 1
      from public.laboratory_accredited_tests lat
      join public.laboratory_accreditations la on la.id = lat.accreditation_id
      where lat.test_id = t.id
        and lat.active
        and la.active
        and la.laboratory_id = l.id
        and la.valid_from <= current_date
        and (la.valid_until is null or la.valid_until >= current_date)
    ) then 'SUBCONTRATADO'
    when l.laboratory_type = 'INTERNAL'
      and t.accreditation_type = 'ACCREDITED'
      and exists (
        select 1
        from public.laboratory_accredited_tests lat
        join public.laboratory_accreditations la on la.id = lat.accreditation_id
        where lat.test_id = t.id
          and lat.active
          and la.active
          and la.laboratory_id = l.id
          and la.valid_from <= current_date
          and (la.valid_until is null or la.valid_until >= current_date)
      ) then 'SA_ACREDITADO'
    else 'SA_NO_ACREDITADO'
  end as execution_class
from public.tests t
left join public.laboratories l on l.id = t.laboratory_id
where t.active;

create or replace view public.v_tests_issuable
with (security_invoker = true)
as
select
  t.id,
  t.code,
  t.parameter_name,
  m.name as matrix_name,
  methods.name as method_name,
  t.default_unit,
  t.lcm,
  l.name as laboratory_name,
  t.accreditation_type,
  t.version,
  t.active,
  classification.execution_class,
  coalesce(cardinality(array_remove(missing.fields, null)), 0) = 0
    and t.valid_from <= current_date
    and (t.valid_until is null or t.valid_until >= current_date) as issuable,
  array_remove(missing.fields, null) as missing_fields
from public.tests t
left join public.matrices m on m.id = t.matrix_id
left join public.methods methods on methods.id = t.method_id
left join public.laboratories l on l.id = t.laboratory_id
cross join lateral (
  select array[
    case when nullif(btrim(t.parameter_name), '') is null or upper(t.parameter_name) = 'FALTA INFO' then 'Parámetro' end,
    case when nullif(btrim(t.default_unit), '') is null or upper(t.default_unit) = 'FALTA INFO' then 'Unidad' end,
    case when t.method_id is null or nullif(btrim(methods.name), '') is null or upper(coalesce(methods.name, '')) = 'FALTA INFO' then 'Método' end,
    case when nullif(btrim(t.technique), '') is null or upper(t.technique) = 'FALTA INFO' then 'Técnica' end,
    case when t.matrix_id is null or nullif(btrim(m.name), '') is null or upper(coalesce(m.name, '')) = 'FALTA INFO' then 'Matriz' end,
    case when t.laboratory_id is null or nullif(btrim(l.name), '') is null or upper(coalesce(l.name, '')) = 'FALTA INFO' then 'Laboratorio' end,
    case when t.lcm is null then 'LCM' end,
    case when t.accreditation_type is null or (
      t.accreditation_type = 'ACCREDITED'
      and not exists (
        select 1
        from public.laboratory_accredited_tests lat
        join public.laboratory_accreditations la on la.id = lat.accreditation_id
        where lat.test_id = t.id and lat.active and la.active
          and la.laboratory_id = l.id
          and la.valid_from <= current_date
          and (la.valid_until is null or la.valid_until >= current_date)
      )
    ) then 'Acreditación' end,
    case when t.valid_from is null or t.valid_from > current_date
      or (t.valid_until is not null and t.valid_until < current_date) then 'Vigencia' end
  ]::text[] as fields
) as missing
left join public.v_test_execution_classification classification on classification.test_id = t.id
where t.active;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'matrices', 'methods', 'laboratories', 'laboratory_accreditations',
    'laboratory_accredited_tests', 'tests', 'test_aliases', 'test_groups',
    'test_group_members', 'report_templates', 'holidays'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (active and public.current_user_is_active())', table_name || '_select_active', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_role(''ADMIN''))', table_name || '_admin_select_all', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_role(''ADMIN''))', table_name || '_admin_insert', table_name);
    if table_name = 'tests' then
      execute 'create policy tests_admin_update on public.tests for update to authenticated using (public.has_role(''ADMIN'')) with check (public.has_role(''ADMIN''))';
      execute 'grant insert on public.tests to authenticated';
      execute 'grant update (active) on public.tests to authenticated';
    elsif table_name = 'report_templates' then
      execute 'create policy report_templates_admin_update on public.report_templates for update to authenticated using (public.has_role(''ADMIN'')) with check (public.has_role(''ADMIN''))';
      execute 'grant insert (code, version, configuration, active) on public.report_templates to authenticated';
      execute 'grant update (active, configuration) on public.report_templates to authenticated';
    else
      execute format('create policy %I on public.%I for update to authenticated using (public.has_role(''ADMIN'')) with check (public.has_role(''ADMIN''))', table_name || '_admin_update', table_name);
      execute format('grant insert, update on public.%I to authenticated', table_name);
    end if;
  end loop;
end;
$$;

revoke all on public.v_test_execution_classification, public.v_tests_issuable from anon, authenticated;
grant select on public.v_test_execution_classification, public.v_tests_issuable to authenticated;
revoke all on function public.set_catalog_audit_columns() from public, anon, authenticated;
revoke all on function public.audit_catalog_change() from public, anon, authenticated;
revoke all on function public.prevent_test_technical_update() from public, anon, authenticated;
revoke all on function public.apply_catalog_triggers(text) from public, anon, authenticated;
revoke all on function public.create_test_version(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_test_version(uuid, jsonb) to authenticated;
drop function public.apply_catalog_triggers(text);
