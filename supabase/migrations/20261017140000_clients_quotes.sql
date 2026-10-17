create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nit text,
  business_name text not null check (btrim(business_name) <> ''),
  alias text,
  address text,
  city text,
  preferred_regulation_note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict
);

create unique index clients_nit_unique
  on public.clients (btrim(nit))
  where nit is not null and btrim(nit) <> '';

create index clients_business_name_trgm
  on public.clients using gin (business_name extensions.gin_trgm_ops);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  job_title text,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  unique (client_id, id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  contact_id uuid,
  quote_date date not null default current_date,
  valid_until date,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED')),
  decision_rule text,
  observations text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  constraint quotes_contact_belongs_to_client
    foreign key (client_id, contact_id)
    references public.contacts (client_id, id)
    on delete restrict,
  check (valid_until is null or valid_until >= quote_date)
);

create index quotes_client_status on public.quotes (client_id, status);

create table public.quote_tests (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  test_id uuid not null references public.tests(id) on delete restrict,
  matrix_id uuid references public.matrices(id) on delete restrict,
  suggested_laboratory_id uuid references public.laboratories(id) on delete restrict,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict
);

create unique index quote_tests_active_without_matrix_unique
  on public.quote_tests (quote_id, test_id)
  where active and matrix_id is null;

create unique index quote_tests_active_with_matrix_unique
  on public.quote_tests (quote_id, test_id, matrix_id)
  where active and matrix_id is not null;

create table public.quote_regulations (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  regulation_name text not null check (btrim(regulation_name) <> ''),
  article text,
  activity text,
  discharge_type text not null check (discharge_type in ('ARD', 'ARnD', 'NA')),
  decision_rule text,
  regulation_version_id uuid references public.regulation_versions(id) on delete restrict,
  requires_confirmation boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict
);

alter table public.reports
  add constraint reports_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete restrict,
  add constraint reports_contact_matches_client_fkey
    foreign key (client_id, contact_id)
    references public.contacts(client_id, id) on delete restrict;

create or replace function public.assign_quote_code()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  display_format text;
  sequence_number bigint;
  sequence_text text;
begin
  if new.code is not null then
    return new;
  end if;

  select setting.value #>> '{}'
    into display_format
  from public.app_settings as setting
  where setting.key = 'document.format.COT';

  if display_format is null or position('NNNN' in display_format) = 0
    or position('AAAA' in display_format) = 0 then
    raise exception using errcode = '22023',
      message = 'Configure el formato document.format.COT con NNNN y AAAA.';
  end if;

  sequence_number := public.next_counter('COT', extract(year from new.quote_date)::integer);
  sequence_text := case
    when length(sequence_number::text) > 4 then sequence_number::text
    else lpad(sequence_number::text, 4, '0')
  end;
  new.code := replace(
    replace(display_format, 'NNNN', sequence_text),
    'AAAA',
    extract(year from new.quote_date)::integer::text
  );
  return new;
end;
$$;

create trigger quotes_assign_code
before insert on public.quotes
for each row execute function public.assign_quote_code();

create or replace function public.set_commercial_audit_columns()
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

create or replace function public.audit_commercial_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  old_row jsonb;
  new_row jsonb;
  record_id uuid;
  action_name text;
begin
  if tg_op = 'UPDATE' then
    old_row := to_jsonb(old);
    new_row := to_jsonb(new);
    record_id := new.id;
    if old_row -> 'status' is distinct from new_row -> 'status' then
      action_name := 'STATUS_CHANGED';
    elsif old_row -> 'active' is distinct from new_row -> 'active' then
      action_name := case when new.active then 'ACTIVATE' else 'DEACTIVATE' end;
    else
      action_name := 'UPDATE';
    end if;
  else
    new_row := to_jsonb(new);
    record_id := new.id;
    action_name := 'CREATE';
  end if;

  perform public.log_audit(
    action_name,
    upper(tg_table_name),
    record_id,
    old_row,
    new_row
  );
  return new;
end;
$$;

create or replace function public.apply_commercial_triggers(target_table text)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  execute format(
    'create trigger %I before insert or update on public.%I for each row execute function public.set_updated_at()',
    target_table || '_set_updated_at',
    target_table
  );
  execute format(
    'create trigger %I before insert or update on public.%I for each row execute function public.set_commercial_audit_columns()',
    target_table || '_set_audit_columns',
    target_table
  );
  execute format(
    'create trigger %I after insert or update on public.%I for each row execute function public.audit_commercial_change()',
    target_table || '_audit_changes',
    target_table
  );
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'clients', 'contacts', 'quotes', 'quote_tests', 'quote_regulations'
  ] loop
    perform public.apply_commercial_triggers(target_table);
  end loop;
end;
$$;

drop function public.apply_commercial_triggers(text);

create or replace function public.find_similar_clients(
  client_name text,
  exclude_client_id uuid default null
)
returns table (id uuid, business_name text, similarity_score real)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
begin
  if auth.uid() is null or not public.current_user_is_active() then
    raise exception using errcode = '42501', message = 'Usuario activo requerido.';
  end if;
  if client_name is null or btrim(client_name) = '' then
    raise exception using errcode = '22023', message = 'La razón social es obligatoria.';
  end if;

  return query
    select c.id, c.business_name,
      extensions.similarity(lower(btrim(c.business_name)), lower(btrim(client_name)))
    from public.clients as c
    where c.id is distinct from exclude_client_id
      and extensions.similarity(lower(btrim(c.business_name)), lower(btrim(client_name))) > 0
    order by 3 desc, c.business_name;
end;
$$;

create or replace function public.save_quote(
  target_quote_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  quote_record_id uuid;
  line_item jsonb;
  regulation_item jsonb;
begin
  if not public.has_any_role(array['ADMIN', 'COMERCIAL']) then
    raise exception using errcode = '42501', message = 'Se requiere rol ADMIN o COMERCIAL.';
  end if;
  if payload is null or jsonb_typeof(payload) is distinct from 'object'
    or jsonb_typeof(payload -> 'tests') is distinct from 'array'
    or jsonb_typeof(payload -> 'regulations') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'La cotización debe incluir ensayos y normativa en formato de lista.';
  end if;
  if exists (
    select 1 from jsonb_object_keys(payload) as keys(key_name)
    where key_name not in (
      'client_id', 'contact_id', 'quote_date', 'valid_until',
      'decision_rule', 'observations', 'tests', 'regulations'
    )
  ) then
    raise exception using errcode = '22023', message = 'La cotización contiene campos no permitidos.';
  end if;
  if not exists (
    select 1 from public.clients as c
    where c.id = (payload ->> 'client_id')::uuid and c.active
  ) then
    raise exception using errcode = '22023', message = 'Seleccione un cliente activo.';
  end if;

  if target_quote_id is null then
    insert into public.quotes (
      client_id, contact_id, quote_date, valid_until,
      decision_rule, observations, status
    )
    values (
      (payload ->> 'client_id')::uuid,
      nullif(payload ->> 'contact_id', '')::uuid,
      coalesce(nullif(payload ->> 'quote_date', '')::date, current_date),
      nullif(payload ->> 'valid_until', '')::date,
      nullif(payload ->> 'decision_rule', ''),
      nullif(payload ->> 'observations', ''),
      'DRAFT'
    )
    returning id into quote_record_id;
  else
    update public.quotes as q
    set client_id = (payload ->> 'client_id')::uuid,
        contact_id = nullif(payload ->> 'contact_id', '')::uuid,
        quote_date = coalesce(nullif(payload ->> 'quote_date', '')::date, current_date),
        valid_until = nullif(payload ->> 'valid_until', '')::date,
        decision_rule = nullif(payload ->> 'decision_rule', ''),
        observations = nullif(payload ->> 'observations', '')
    where q.id = target_quote_id and q.active
    returning q.id into quote_record_id;
    if quote_record_id is null then
      raise exception using errcode = 'P0002', message = 'No se encontró la cotización activa.';
    end if;
    update public.quote_tests set active = false where quote_id = quote_record_id and active;
    update public.quote_regulations set active = false where quote_id = quote_record_id and active;
  end if;

  for line_item in select value from jsonb_array_elements(payload -> 'tests')
  loop
    if jsonb_typeof(line_item) <> 'object'
      or (line_item ->> 'test_id') is null then
      raise exception using errcode = '22023', message = 'Cada ensayo debe indicar test_id.';
    end if;
    if not exists (
      select 1 from public.tests as t
      where t.id = (line_item ->> 'test_id')::uuid and t.active
    ) then
      raise exception using errcode = '22023', message = 'Un ensayo seleccionado no está activo.';
    end if;
    insert into public.quote_tests (
      quote_id, test_id, matrix_id, suggested_laboratory_id, notes
    )
    values (
      quote_record_id,
      (line_item ->> 'test_id')::uuid,
      nullif(line_item ->> 'matrix_id', '')::uuid,
      nullif(line_item ->> 'suggested_laboratory_id', '')::uuid,
      nullif(line_item ->> 'notes', '')
    );
  end loop;

  for regulation_item in select value from jsonb_array_elements(payload -> 'regulations')
  loop
    if jsonb_typeof(regulation_item) <> 'object'
      or nullif(btrim(regulation_item ->> 'regulation_name'), '') is null
      or regulation_item ->> 'discharge_type' not in ('ARD', 'ARnD', 'NA') then
      raise exception using errcode = '22023', message = 'Complete la norma y el tipo de descarga.';
    end if;
    insert into public.quote_regulations (
      quote_id, regulation_name, article, activity, discharge_type,
      decision_rule, requires_confirmation
    )
    values (
      quote_record_id,
      btrim(regulation_item ->> 'regulation_name'),
      nullif(regulation_item ->> 'article', ''),
      nullif(regulation_item ->> 'activity', ''),
      regulation_item ->> 'discharge_type',
      nullif(regulation_item ->> 'decision_rule', ''),
      true
    );
  end loop;

  return quote_record_id;
end;
$$;

create or replace function public.set_quote_status(
  target_quote_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.has_any_role(array['ADMIN', 'COMERCIAL']) then
    raise exception using errcode = '42501', message = 'Se requiere rol ADMIN o COMERCIAL.';
  end if;
  if new_status not in ('DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED') then
    raise exception using errcode = '22023', message = 'Estado de cotización no válido.';
  end if;
  update public.quotes
  set status = new_status
  where id = target_quote_id and active;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró la cotización activa.';
  end if;
end;
$$;

alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_tests enable row level security;
alter table public.quote_regulations enable row level security;

create policy clients_read_active_users on public.clients
  for select to authenticated using (public.current_user_is_active());
create policy clients_commercial_insert on public.clients
  for insert to authenticated with check (public.has_any_role(array['ADMIN', 'COMERCIAL']));
create policy clients_commercial_update on public.clients
  for update to authenticated
  using (public.has_any_role(array['ADMIN', 'COMERCIAL']))
  with check (public.has_any_role(array['ADMIN', 'COMERCIAL']));

create policy contacts_read_active_users on public.contacts
  for select to authenticated using (public.current_user_is_active());
create policy contacts_commercial_insert on public.contacts
  for insert to authenticated with check (public.has_any_role(array['ADMIN', 'COMERCIAL']));
create policy contacts_commercial_update on public.contacts
  for update to authenticated
  using (public.has_any_role(array['ADMIN', 'COMERCIAL']))
  with check (public.has_any_role(array['ADMIN', 'COMERCIAL']));

create policy quotes_read_authorized on public.quotes
  for select to authenticated
  using (
    public.current_user_is_active()
    and (
      public.has_any_role(array['ADMIN', 'COMERCIAL'])
      or status = 'ACTIVE'
    )
  );
create policy quote_tests_read_visible_quote on public.quote_tests
  for select to authenticated
  using (
    active and exists (
      select 1 from public.quotes q where q.id = quote_id
    )
  );
create policy quote_regulations_read_visible_quote on public.quote_regulations
  for select to authenticated
  using (
    active and exists (
      select 1 from public.quotes q where q.id = quote_id
    )
  );

revoke all on public.clients, public.contacts, public.quotes,
  public.quote_tests, public.quote_regulations from anon, authenticated;
grant select, insert, update on public.clients, public.contacts to authenticated;
grant select on public.quotes, public.quote_tests, public.quote_regulations to authenticated;

revoke all on function public.set_commercial_audit_columns() from public, anon, authenticated;
revoke all on function public.audit_commercial_change() from public, anon, authenticated;
revoke all on function public.assign_quote_code() from public, anon, authenticated;
revoke all on function public.find_similar_clients(text, uuid) from public, anon;
revoke all on function public.save_quote(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_quote_status(uuid, text) from public, anon, authenticated;
grant execute on function public.find_similar_clients(text, uuid) to authenticated;
grant execute on function public.save_quote(uuid, jsonb) to authenticated;
grant execute on function public.set_quote_status(uuid, text) to authenticated;
