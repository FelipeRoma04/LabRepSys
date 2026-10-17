create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text,
  email text,
  job_title text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

create table public.roles (
  code text primary key,
  name text not null,
  description text not null
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete restrict,
  role_code text not null references public.roles(code) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, role_code)
);

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active
  );
$$;

create or replace function public.has_role(requested_role text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_user_is_active()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role_code = requested_role
    );
$$;

create or replace function public.has_any_role(requested_roles text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_user_is_active()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role_code = any(requested_roles)
    );
$$;

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text not null,
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

create or replace function public.set_app_settings_updated_by()
returns trigger
language plpgsql
set search_path = pg_catalog, auth
as $$
begin
  if auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

create trigger app_settings_set_updated_by
before insert or update on public.app_settings
for each row execute function public.set_app_settings_updated_by();

create table public.document_counters (
  counter_code text not null,
  period_year integer not null,
  last_value bigint not null check (last_value >= 0),
  primary key (counter_code, period_year)
);

create or replace function public.next_counter(
  counter_code text,
  period_year integer
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
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
  values (counter_code, period_year, 1)
  on conflict (counter_code, period_year)
  do update set last_value = counters.last_value + 1
  returning last_value into next_value;

  return next_value;
end;
$$;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  reason text,
  correlation_id uuid,
  created_at timestamptz not null default now()
);

create or replace function public.log_audit(
  action text,
  entity_type text,
  entity_id uuid default null,
  old_data jsonb default null,
  new_data jsonb default null,
  reason text default null,
  correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  audit_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_active() then
    raise exception using errcode = '42501', message = 'Usuario activo requerido';
  end if;

  if action is null or btrim(action) = ''
    or entity_type is null or btrim(entity_type) = '' then
    raise exception using errcode = '22023', message = 'Acción y tipo de entidad son requeridos';
  end if;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    reason,
    correlation_id
  )
  values (
    auth.uid(),
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    reason,
    correlation_id
  )
  returning id into audit_id;

  return audit_id;
end;
$$;

create or replace function public.audit_profile_activation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.active is distinct from new.active then
    perform public.log_audit(
      case when new.active then 'PROFILE_ACTIVATED' else 'PROFILE_DEACTIVATED' end,
      'PROFILE',
      new.id,
      jsonb_build_object('active', old.active),
      jsonb_build_object('active', new.active)
    );
  end if;
  return new;
end;
$$;

create trigger profiles_audit_activation
after update of active on public.profiles
for each row execute function public.audit_profile_activation();

create or replace function public.audit_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    if tg_op = 'INSERT' then
      return new;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform public.log_audit(
      'USER_ROLE_ASSIGNED',
      'USER_ROLE',
      new.user_id,
      null,
      to_jsonb(new)
    );
    return new;
  end if;

  perform public.log_audit(
    'USER_ROLE_REMOVED',
    'USER_ROLE',
    old.user_id,
    to_jsonb(old),
    null
  );
  return old;
end;
$$;

create trigger user_roles_audit_insert
after insert on public.user_roles
for each row execute function public.audit_user_role_change();

create trigger user_roles_audit_delete
after delete on public.user_roles
for each row execute function public.audit_user_role_change();

create or replace function public.audit_app_setting_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.log_audit(
      'APP_SETTING_CREATED',
      'APP_SETTING',
      null,
      null,
      to_jsonb(new)
    );
    return new;
  end if;

  perform public.log_audit(
    'APP_SETTING_UPDATED',
    'APP_SETTING',
    null,
    to_jsonb(old),
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger app_settings_audit_insert
after insert on public.app_settings
for each row execute function public.audit_app_setting_change();

create trigger app_settings_audit_update
after update on public.app_settings
for each row execute function public.audit_app_setting_change();

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.app_settings enable row level security;
alter table public.document_counters enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_own
on public.profiles for select to authenticated
using (id = auth.uid());

create policy profiles_admin_select
on public.profiles for select to authenticated
using (public.has_role('ADMIN'));

create policy profiles_admin_activate
on public.profiles for update to authenticated
using (public.has_role('ADMIN'))
with check (public.has_role('ADMIN'));

create policy roles_select_active_users
on public.roles for select to authenticated
using (public.current_user_is_active());

create policy user_roles_select_own
on public.user_roles for select to authenticated
using (user_id = auth.uid());

create policy user_roles_admin_select
on public.user_roles for select to authenticated
using (public.has_role('ADMIN'));

create policy user_roles_admin_insert
on public.user_roles for insert to authenticated
with check (
  public.has_role('ADMIN')
  and assigned_by = auth.uid()
);

create policy user_roles_admin_delete
on public.user_roles for delete to authenticated
using (public.has_role('ADMIN'));

create policy app_settings_select_active
on public.app_settings for select to authenticated
using (public.current_user_is_active());

create policy app_settings_admin_insert
on public.app_settings for insert to authenticated
with check (public.has_role('ADMIN'));

create policy app_settings_admin_update
on public.app_settings for update to authenticated
using (public.has_role('ADMIN'))
with check (public.has_role('ADMIN'));

create policy audit_logs_select_authorized_roles
on public.audit_logs for select to authenticated
using (
  public.has_any_role(array['ADMIN', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'])
);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (active) on public.profiles to authenticated;

revoke all on public.roles from anon, authenticated;
grant select on public.roles to authenticated;

revoke all on public.user_roles from anon, authenticated;
grant select, insert, delete on public.user_roles to authenticated;

revoke all on public.app_settings from anon, authenticated;
grant select, insert, update on public.app_settings to authenticated;

revoke all on public.document_counters from anon, authenticated;

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.set_app_settings_updated_by() from public, anon, authenticated;
revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
revoke all on function public.audit_profile_activation() from public, anon, authenticated;
revoke all on function public.audit_user_role_change() from public, anon, authenticated;
revoke all on function public.audit_app_setting_change() from public, anon, authenticated;
revoke all on function public.current_user_is_active() from public, anon;
revoke all on function public.has_role(text) from public, anon;
revoke all on function public.has_any_role(text[]) from public, anon;
revoke all on function public.next_counter(text, integer) from public, anon;
revoke all on function public.log_audit(text, text, uuid, jsonb, jsonb, text, uuid)
  from public, anon, authenticated;

grant execute on function public.current_user_is_active() to authenticated;
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.has_any_role(text[]) to authenticated;
grant execute on function public.next_counter(text, integer) to authenticated;

insert into storage.buckets (id, name, public)
values
  ('source-files', 'source-files', false),
  ('report-drafts', 'report-drafts', false),
  ('issued-reports', 'issued-reports', false),
  ('signatures', 'signatures', false)
on conflict (id) do update set public = false;

create policy source_files_upload_authorized
on storage.objects for insert to authenticated
with check (
  bucket_id = 'source-files'
  and name ~ '^samples/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-[A-Za-z0-9_. -]+$'
  and public.has_any_role(array['ADMIN', 'RECEPCION'])
);

create policy source_files_admin_update
on storage.objects for update to authenticated
using (
  bucket_id = 'source-files'
  and name ~ '^samples/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-[A-Za-z0-9_. -]+$'
  and public.has_any_role(array['ADMIN', 'RECEPCION'])
)
with check (
  bucket_id = 'source-files'
  and name ~ '^samples/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-[A-Za-z0-9_. -]+$'
  and public.has_any_role(array['ADMIN', 'RECEPCION'])
);

create policy report_drafts_admin_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'report-drafts' and public.has_role('ADMIN'));

create policy report_drafts_admin_update
on storage.objects for update to authenticated
using (bucket_id = 'report-drafts' and public.has_role('ADMIN'))
with check (bucket_id = 'report-drafts' and public.has_role('ADMIN'));

create policy issued_reports_admin_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'issued-reports' and public.has_role('ADMIN'));

create policy issued_reports_admin_update
on storage.objects for update to authenticated
using (bucket_id = 'issued-reports' and public.has_role('ADMIN'))
with check (bucket_id = 'issued-reports' and public.has_role('ADMIN'));

create policy signatures_admin_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'signatures' and public.has_role('ADMIN'));

create policy signatures_admin_update
on storage.objects for update to authenticated
using (bucket_id = 'signatures' and public.has_role('ADMIN'))
with check (bucket_id = 'signatures' and public.has_role('ADMIN'));

revoke select on storage.objects from anon, authenticated;

grant select on public.profiles, public.user_roles to service_role;
grant insert on public.audit_logs to service_role;
