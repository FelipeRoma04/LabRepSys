insert into public.app_settings (key, value, description)
values (
  'sample.code_pattern',
  to_jsonb('^AG[0-9]{4}$'::text),
  'Expresión regular para validar códigos de muestra; prefijos por matriz y reinicio anual quedan pendientes de DP-032.'
)
on conflict (key) do nothing;

alter table public.quotes
  add constraint quotes_id_client_unique unique (id, client_id);

create table public.samples (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  quote_id uuid,
  matrix_id uuid references public.matrices(id) on delete restrict,
  plan_code text,
  sampling_point text,
  sampled_at timestamptz,
  received_at timestamptz not null default now(),
  status text not null default 'RECEIVED',
  observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict
);

alter table public.samples
  add constraint samples_quote_matches_client_fkey
    foreign key (quote_id, client_id)
    references public.quotes(id, client_id) on delete restrict;

create index samples_client_id_idx on public.samples (client_id);
create index samples_quote_id_idx on public.samples (quote_id) where quote_id is not null;
create index samples_sampled_at_idx on public.samples (sampled_at);
create index samples_status_idx on public.samples (status);

create table public.sample_receptions (
  sample_id uuid primary key references public.samples(id) on delete restrict,
  containers jsonb not null default '[]'::jsonb check (jsonb_typeof(containers) = 'array'),
  preservation jsonb not null default '{}'::jsonb check (jsonb_typeof(preservation) = 'object'),
  received_by uuid not null references public.profiles(id) on delete restrict,
  chain_of_custody_verified boolean not null default false,
  arrival_conditions text,
  deviations text,
  client_consulted_on_deviation boolean not null default false,
  request_review jsonb not null default '{}'::jsonb check (jsonb_typeof(request_review) = 'object'),
  signature_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  check (
    nullif(btrim(deviations), '') is null
    or client_consulted_on_deviation
  )
);

create table public.sample_tests (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.samples(id) on delete restrict,
  test_id uuid not null references public.tests(id) on delete restrict,
  execution_type text not null check (execution_type in ('SA', 'SUBCONTRACTED')),
  assigned_laboratory_id uuid references public.laboratories(id) on delete restrict,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  check (execution_type <> 'SUBCONTRACTED' or assigned_laboratory_id is not null)
);

create table public.sample_events (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references public.samples(id) on delete restrict,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict
);

alter table public.sample_regulations
  add constraint sample_regulations_sample_id_fkey
    foreign key (sample_id) references public.samples(id) on delete restrict;

alter table public.external_shipments
  add constraint external_shipments_sample_id_fkey
    foreign key (sample_id) references public.samples(id) on delete restrict;

alter table public.report_samples
  add constraint report_samples_sample_id_fkey
    foreign key (sample_id) references public.samples(id) on delete restrict;

create or replace function public.validate_sample_code()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  code_pattern text;
begin
  select setting.value #>> '{}'
  into code_pattern
  from public.app_settings as setting
  where setting.key = 'sample.code_pattern';

  code_pattern := coalesce(code_pattern, '^AG[0-9]{4}$');
  if length(new.code) > 64 or new.code !~ code_pattern then
    raise exception using errcode = '22023',
      message = 'El código de muestra no cumple el patrón configurado.';
  end if;
  return new;
end;
$$;

create trigger samples_validate_code
before insert or update of code on public.samples
for each row execute function public.validate_sample_code();

create or replace function public.set_sample_audit_columns()
returns trigger
language plpgsql
set search_path = pg_catalog, auth
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.audit_sample_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  old_row jsonb;
  new_row jsonb;
  event_id uuid;
  action_name text;
begin
  new_row := to_jsonb(new);
  if tg_op = 'UPDATE' then
    old_row := to_jsonb(old);
    action_name := case
      when old.status is distinct from new.status then 'STATUS_CHANGED'
      else 'UPDATED'
    end;
  else
    action_name := 'CREATED';
  end if;

  insert into public.sample_events (sample_id, event_type, detail, created_by)
  values (
    new.id,
    action_name,
    jsonb_build_object('old_data', old_row, 'new_data', new_row),
    auth.uid()
  )
  returning id into event_id;

  perform public.log_audit(
    action_name,
    'SAMPLE',
    new.id,
    old_row,
    new_row,
    case when tg_op = 'UPDATE' then current_setting('app.sample_edit_reason', true) end
  );
  return new;
end;
$$;

create or replace function public.audit_sample_reception_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  old_row jsonb;
  new_row jsonb;
begin
  new_row := to_jsonb(new);
  if tg_op = 'UPDATE' then
    old_row := to_jsonb(old);
  end if;
  perform public.log_audit(
    case when tg_op = 'INSERT' then 'CREATED' else 'UPDATED' end,
    'SAMPLE_RECEPTION',
    new.sample_id,
    old_row,
    new_row,
    case when tg_op = 'UPDATE' then current_setting('app.sample_edit_reason', true) end
  );
  return new;
end;
$$;

create trigger samples_set_updated_at
before update on public.samples
for each row execute function public.set_updated_at();
create trigger samples_set_audit_columns
before insert or update on public.samples
for each row execute function public.set_sample_audit_columns();
create trigger samples_audit_change
after insert or update on public.samples
for each row execute function public.audit_sample_change();
create trigger sample_receptions_set_updated_at
before update on public.sample_receptions
for each row execute function public.set_updated_at();
create trigger sample_receptions_set_audit_columns
before insert or update on public.sample_receptions
for each row execute function public.set_sample_audit_columns();
create trigger sample_receptions_audit_change
after insert or update on public.sample_receptions
for each row execute function public.audit_sample_reception_change();

create or replace function public.save_sample(
  target_sample_id uuid,
  payload jsonb,
  edit_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  sample_record_id uuid;
  sample_data jsonb;
  reception_data jsonb;
  test_item jsonb;
  selected_client_id uuid;
  selected_quote_id uuid;
  selected_matrix_id uuid;
  received_timestamp timestamptz;
  sampled_timestamp timestamptz;
  previous_status text;
  suggestions_confirmed boolean;
  decision_rule text;
  previous_tests jsonb;
  current_tests jsonb;
begin
  if not public.has_any_role(array['ADMIN', 'RECEPCION']) then
    raise exception using errcode = '42501', message = 'Se requiere rol ADMIN o RECEPCION.';
  end if;
  if payload is null or jsonb_typeof(payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'La solicitud de muestra no es válida.';
  end if;
  if target_sample_id is not null and nullif(btrim(edit_reason), '') is null then
    raise exception using errcode = '22023', message = 'Indique el motivo del cambio posterior a la recepción.';
  end if;
  if jsonb_typeof(payload -> 'tests') is distinct from 'array'
    or jsonb_typeof(payload -> 'containers') is distinct from 'array'
    or jsonb_typeof(payload -> 'preservation') is distinct from 'object'
    or jsonb_typeof(payload -> 'request_review') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Ensayos, recipientes, preservación o revisión tienen formato inválido.';
  end if;

  selected_client_id := nullif(payload ->> 'client_id', '')::uuid;
  selected_quote_id := nullif(payload ->> 'quote_id', '')::uuid;
  selected_matrix_id := nullif(payload ->> 'matrix_id', '')::uuid;
  received_timestamp := coalesce(nullif(payload ->> 'received_at', '')::timestamptz, now());
  sampled_timestamp := nullif(payload ->> 'sampled_at', '')::timestamptz;
  suggestions_confirmed := coalesce((payload ->> 'quote_suggestions_confirmed')::boolean, false);
  reception_data := payload -> 'reception';
  sample_data := payload;

  if selected_client_id is null
    or not exists (select 1 from public.clients c where c.id = selected_client_id and c.active) then
    raise exception using errcode = '22023', message = 'Seleccione un cliente activo.';
  end if;
  if selected_matrix_id is not null
    and not exists (select 1 from public.matrices m where m.id = selected_matrix_id and m.active) then
    raise exception using errcode = '22023', message = 'La matriz seleccionada no está activa.';
  end if;
  if selected_quote_id is not null then
    if not suggestions_confirmed then
      raise exception using errcode = '22023', message = 'Confirme explícitamente las sugerencias de la cotización.';
    end if;
    if not exists (
      select 1 from public.quotes q
      where q.id = selected_quote_id
        and q.client_id = selected_client_id
        and q.active
        and q.status = 'ACTIVE'
        and (q.valid_until is null or q.valid_until >= current_date)
    ) then
      raise exception using errcode = '22023', message = 'La cotización no está vigente o no corresponde al cliente.';
    end if;
  end if;
  if nullif(btrim(payload ->> 'code'), '') is null then
    raise exception using errcode = '22023', message = 'El código de muestra es obligatorio.';
  end if;
  if jsonb_typeof(reception_data) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Complete la información de recepción.';
  end if;
  if coalesce((reception_data ->> 'has_deviation')::boolean, false)
    and (
      nullif(btrim(reception_data ->> 'deviations'), '') is null
      or not coalesce((reception_data ->> 'client_consulted_on_deviation')::boolean, false)
    ) then
    raise exception using errcode = '22023', message = 'Describa la desviación y registre la consulta al cliente antes de continuar.';
  end if;
  if coalesce((payload #>> '{request_review,capacity_verified}')::boolean, false) is not true
    or coalesce((payload #>> '{request_review,methods_verified}')::boolean, false) is not true then
    raise exception using errcode = '22023', message = 'Verifique la capacidad y los métodos antes de guardar.';
  end if;
  if coalesce((payload #>> '{request_review,conformity_requested}')::boolean, false) then
    decision_rule := nullif(btrim(payload #>> '{request_review,decision_rule}'), '');
    if decision_rule is null then
      raise exception using errcode = '22023', message = 'Registre la regla de decisión acordada para la declaración de conformidad.';
    end if;
  end if;
  for test_item in select value from jsonb_array_elements(payload -> 'tests')
  loop
    if jsonb_typeof(test_item) is distinct from 'object'
      or nullif(test_item ->> 'test_id', '') is null
      or test_item ->> 'execution_type' not in ('SA', 'SUBCONTRACTED') then
      raise exception using errcode = '22023', message = 'Cada ensayo requiere código de ensayo y tipo de ejecución.';
    end if;
    if test_item ->> 'execution_type' = 'SUBCONTRACTED'
      and nullif(test_item ->> 'assigned_laboratory_id', '') is null then
      raise exception using errcode = '22023', message = 'Asigne un laboratorio a cada ensayo subcontratado.';
    end if;
  end loop;

  if target_sample_id is null then
    insert into public.samples (
      code, client_id, quote_id, matrix_id, plan_code,
      sampling_point, sampled_at, received_at, status, observations
    )
    values (
      btrim(payload ->> 'code'),
      selected_client_id,
      selected_quote_id,
      selected_matrix_id,
      nullif(btrim(payload ->> 'plan_code'), ''),
      nullif(btrim(payload ->> 'sampling_point'), ''),
      sampled_timestamp,
      received_timestamp,
      'RECEIVED',
      nullif(btrim(payload ->> 'observations'), '')
    )
    returning id into sample_record_id;
  else
    select status into previous_status
    from public.samples where id = target_sample_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'No se encontró la muestra.';
    end if;
    select coalesce(jsonb_agg(to_jsonb(test_row) - 'created_by' - 'updated_by'), '[]'::jsonb)
      into previous_tests
    from public.sample_tests as test_row
    where test_row.sample_id = target_sample_id;
    perform set_config('app.sample_edit_reason', btrim(edit_reason), true);
    update public.samples
    set code = btrim(payload ->> 'code'),
        client_id = selected_client_id,
        quote_id = selected_quote_id,
        matrix_id = selected_matrix_id,
        plan_code = nullif(btrim(payload ->> 'plan_code'), ''),
        sampling_point = nullif(btrim(payload ->> 'sampling_point'), ''),
        sampled_at = sampled_timestamp,
        received_at = received_timestamp,
        status = case when previous_status = 'PENDING_REVIEW' then 'RECEIVED' else status end,
        observations = nullif(btrim(payload ->> 'observations'), '')
    where id = target_sample_id;
    sample_record_id := target_sample_id;
  end if;

  if target_sample_id is null then
    insert into public.sample_receptions (
      sample_id, containers, preservation, received_by,
      chain_of_custody_verified, arrival_conditions, deviations,
      client_consulted_on_deviation, request_review, signature_reference
    )
    values (
      sample_record_id,
      payload -> 'containers',
      payload -> 'preservation',
      auth.uid(),
      coalesce((reception_data ->> 'chain_of_custody_verified')::boolean, false),
      nullif(btrim(reception_data ->> 'arrival_conditions'), ''),
      case when coalesce((reception_data ->> 'has_deviation')::boolean, false)
        then nullif(btrim(reception_data ->> 'deviations'), '') end,
      coalesce((reception_data ->> 'client_consulted_on_deviation')::boolean, false),
      payload -> 'request_review'
        || jsonb_build_object(
          'quote_suggestions', case when selected_quote_id is null then null else jsonb_build_object(
            'quote_id', selected_quote_id,
            'confirmed', suggestions_confirmed,
            'confirmed_at', now(),
            'regulations', coalesce(payload -> 'suggested_regulations', '[]'::jsonb)
          ) end
        ),
      nullif(btrim(reception_data ->> 'signature_reference'), '')
    );
    insert into public.sample_tests (
      sample_id, test_id, execution_type, assigned_laboratory_id
    )
    select
      sample_record_id,
      (item ->> 'test_id')::uuid,
      item ->> 'execution_type',
      nullif(item ->> 'assigned_laboratory_id', '')::uuid
    from jsonb_array_elements(payload -> 'tests') as items(item);
    insert into public.sample_events (sample_id, event_type, detail, created_by)
    values (
      sample_record_id,
      'RECEPTION_COMPLETED',
      jsonb_build_object(
        'quote_id', selected_quote_id,
        'suggestions_confirmed', suggestions_confirmed,
        'tests_count', jsonb_array_length(payload -> 'tests')
      ),
      auth.uid()
    );
  else
    update public.sample_receptions
    set containers = payload -> 'containers',
        preservation = payload -> 'preservation',
        chain_of_custody_verified = coalesce((reception_data ->> 'chain_of_custody_verified')::boolean, false),
        arrival_conditions = nullif(btrim(reception_data ->> 'arrival_conditions'), ''),
        deviations = case when coalesce((reception_data ->> 'has_deviation')::boolean, false)
          then nullif(btrim(reception_data ->> 'deviations'), '') end,
        client_consulted_on_deviation = coalesce((reception_data ->> 'client_consulted_on_deviation')::boolean, false),
        request_review = payload -> 'request_review'
          || jsonb_build_object(
            'quote_suggestions', case when selected_quote_id is null then null else jsonb_build_object(
              'quote_id', selected_quote_id,
              'confirmed', suggestions_confirmed,
              'confirmed_at', now(),
              'regulations', coalesce(payload -> 'suggested_regulations', '[]'::jsonb)
            ) end
          ),
        signature_reference = nullif(btrim(reception_data ->> 'signature_reference'), '')
    where sample_id = sample_record_id;
    delete from public.sample_tests where sample_id = sample_record_id;
    insert into public.sample_tests (
      sample_id, test_id, execution_type, assigned_laboratory_id
    )
    select
      sample_record_id,
      (item ->> 'test_id')::uuid,
      item ->> 'execution_type',
      nullif(item ->> 'assigned_laboratory_id', '')::uuid
    from jsonb_array_elements(payload -> 'tests') as items(item);
    select coalesce(jsonb_agg(to_jsonb(test_row) - 'created_by' - 'updated_by'), '[]'::jsonb)
      into current_tests
    from public.sample_tests as test_row
    where test_row.sample_id = sample_record_id;
    perform public.log_audit(
      'SAMPLE_TESTS_UPDATED',
      'SAMPLE',
      sample_record_id,
      previous_tests,
      current_tests,
      btrim(edit_reason)
    );
    insert into public.sample_events (sample_id, event_type, detail, created_by)
    values (
      sample_record_id,
      'RECEPTION_EDITED',
      jsonb_build_object(
        'reason', btrim(edit_reason),
        'previous_status', previous_status,
        'old_tests', previous_tests,
        'new_tests', current_tests
      ),
      auth.uid()
    );
  end if;

  return sample_record_id;
end;
$$;

create or replace function public.import_samples_csv(
  rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  row_item jsonb;
  row_index integer := 0;
  imported_count integer := 0;
  row_errors jsonb := '[]'::jsonb;
  client_record_id uuid;
  matrix_record_id uuid;
  code_pattern text;
begin
  if not public.has_any_role(array['ADMIN', 'RECEPCION']) then
    raise exception using errcode = '42501', message = 'Se requiere rol ADMIN o RECEPCION.';
  end if;
  if jsonb_typeof(rows) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Las filas CSV deben enviarse como lista.';
  end if;
  select setting.value #>> '{}' into code_pattern
  from public.app_settings setting where setting.key = 'sample.code_pattern';
  code_pattern := coalesce(code_pattern, '^AG[0-9]{4}$');

  for row_item in select value from jsonb_array_elements(rows)
  loop
    row_index := row_index + 1;
    begin
      if jsonb_typeof(row_item) is distinct from 'object'
        or nullif(btrim(row_item ->> 'code'), '') is null then
        raise exception using errcode = '22023', message = 'Código de muestra obligatorio.';
      end if;
      if length(row_item ->> 'code') > 64 or (row_item ->> 'code') !~ code_pattern then
        raise exception using errcode = '22023', message = 'Código inválido según el patrón configurado.';
      end if;
      select c.id into client_record_id
      from public.clients c
      where c.active and (
        c.nit = nullif(btrim(row_item ->> 'client_nit'), '')
        or lower(c.business_name) = lower(nullif(btrim(row_item ->> 'client_name'), ''))
      )
      order by case when c.nit = nullif(btrim(row_item ->> 'client_nit'), '') then 0 else 1 end
      limit 1;
      if client_record_id is null then
        raise exception using errcode = '22023', message = 'Cliente no encontrado.';
      end if;
      select m.id into matrix_record_id from public.matrices m
      where m.active and (
        m.code = nullif(btrim(row_item ->> 'matrix_code'), '')
        or m.name = nullif(btrim(row_item ->> 'matrix_name'), '')
      )
      limit 1;
      if matrix_record_id is null then
        raise exception using errcode = '22023', message = 'Matriz no encontrada.';
      end if;

      insert into public.samples (
        code, client_id, matrix_id, plan_code, sampling_point, sampled_at, status
      )
      values (
        btrim(row_item ->> 'code'),
        client_record_id,
        matrix_record_id,
        nullif(btrim(row_item ->> 'plan_code'), ''),
        nullif(btrim(row_item ->> 'sampling_point'), ''),
        nullif(row_item ->> 'sampled_at', '')::timestamptz,
        'PENDING_REVIEW'
      )
      returning id into client_record_id;
      insert into public.sample_receptions (sample_id, received_by, request_review)
      values (
        client_record_id,
        auth.uid(),
        '{"source":"CSV","review_required":true}'::jsonb
      );
      imported_count := imported_count + 1;
    exception when others then
      row_errors := row_errors || jsonb_build_array(jsonb_build_object(
        'row', row_index + 1,
        'message', sqlerrm
      ));
    end;
  end loop;
  return jsonb_build_object('imported_count', imported_count, 'errors', row_errors);
end;
$$;

alter table public.samples enable row level security;
alter table public.sample_receptions enable row level security;
alter table public.sample_tests enable row level security;
alter table public.sample_events enable row level security;

create policy samples_read_roles on public.samples
  for select to authenticated
  using (public.has_any_role(array[
    'ADMIN', 'RECEPCION', 'ANALISTA', 'MUESTREO',
    'JEFE_TECNICA_CALIDAD', 'AUDITOR'
  ]));
create policy sample_receptions_read_roles on public.sample_receptions
  for select to authenticated
  using (public.has_any_role(array[
    'ADMIN', 'RECEPCION', 'ANALISTA', 'MUESTREO',
    'JEFE_TECNICA_CALIDAD', 'AUDITOR'
  ]));
create policy sample_tests_read_roles on public.sample_tests
  for select to authenticated
  using (public.has_any_role(array[
    'ADMIN', 'RECEPCION', 'ANALISTA', 'MUESTREO',
    'JEFE_TECNICA_CALIDAD', 'AUDITOR'
  ]));
create policy sample_events_read_roles on public.sample_events
  for select to authenticated
  using (public.has_any_role(array[
    'ADMIN', 'RECEPCION', 'ANALISTA', 'MUESTREO',
    'JEFE_TECNICA_CALIDAD', 'AUDITOR'
  ]));

revoke all on public.samples, public.sample_receptions, public.sample_tests, public.sample_events
  from anon, authenticated;
grant select on public.samples, public.sample_receptions, public.sample_tests, public.sample_events
  to authenticated;

revoke all on function public.validate_sample_code() from public, anon, authenticated;
revoke all on function public.set_sample_audit_columns() from public, anon, authenticated;
revoke all on function public.audit_sample_change() from public, anon, authenticated;
revoke all on function public.audit_sample_reception_change() from public, anon, authenticated;
revoke all on function public.save_sample(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.import_samples_csv(jsonb) from public, anon, authenticated;
grant execute on function public.save_sample(uuid, jsonb, text) to authenticated;
grant execute on function public.import_samples_csv(jsonb) to authenticated;
