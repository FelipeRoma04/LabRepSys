create table public.excel_import_batches (
  target text not null check (target in ('tests', 'samples')),
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  file_name text not null check (length(file_name) between 1 and 255),
  total_attempted integer not null check (total_attempted >= 0),
  imported_count integer not null check (imported_count >= 0),
  status text not null check (status in ('PARTIAL', 'COMPLETE')),
  imported_by uuid not null references public.profiles(id) on delete restrict,
  imported_at timestamptz not null default now(),
  primary key (target, file_hash)
);

alter table public.excel_import_batches enable row level security;
revoke all on public.excel_import_batches from anon, authenticated;

create or replace function public.has_excel_import(
  import_target text,
  import_file_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.current_user_is_active() then
    raise exception using errcode = '42501', message = 'Usuario activo requerido.';
  end if;
  if import_target is null or import_target not in ('tests', 'samples')
    or import_file_hash is null or import_file_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Destino o hash de archivo inválido.';
  end if;
  if import_target = 'tests' and not public.has_role('ADMIN') then
    raise exception using errcode = '42501', message = 'Se requiere rol ADMIN para importar ensayos.';
  end if;
  if import_target = 'samples' and not public.has_any_role(array['ADMIN', 'RECEPCION']) then
    raise exception using errcode = '42501', message = 'Se requiere rol ADMIN o RECEPCION para importar muestras.';
  end if;
  return exists (
    select 1 from public.excel_import_batches b
    where b.target = import_target and b.file_hash = import_file_hash and b.status = 'COMPLETE'
  );
end;
$$;

create or replace function public.record_excel_import(
  import_target text,
  import_file_hash text,
  import_file_name text,
  import_total_attempted integer,
  import_imported_count integer,
  import_complete boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  inserted_count integer;
begin
  if not public.current_user_is_active() then
    raise exception using errcode = '42501', message = 'Usuario activo requerido.';
  end if;
  if import_target is null or import_target not in ('tests', 'samples')
    or import_file_hash is null or import_file_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Destino o hash de archivo inválido.';
  end if;
  if import_file_name is null or length(import_file_name) not between 1 and 255
    or import_total_attempted is null or import_imported_count is null
    or import_complete is null
    or import_total_attempted < 0 or import_imported_count < 0
    or import_imported_count > import_total_attempted then
    raise exception using errcode = '22023', message = 'Metadatos de importación inválidos.';
  end if;
  if import_target = 'tests' and not public.has_role('ADMIN') then
    raise exception using errcode = '42501', message = 'Se requiere rol ADMIN para importar ensayos.';
  end if;
  if import_target = 'samples' and not public.has_any_role(array['ADMIN', 'RECEPCION']) then
    raise exception using errcode = '42501', message = 'Se requiere rol ADMIN o RECEPCION para importar muestras.';
  end if;

  insert into public.excel_import_batches (
    target, file_hash, file_name, total_attempted, imported_count, status, imported_by
  ) values (
    import_target, import_file_hash, import_file_name,
    import_total_attempted, import_imported_count,
    case when import_complete then 'COMPLETE' else 'PARTIAL' end,
    auth.uid()
  ) on conflict (target, file_hash) do update
  set file_name = excluded.file_name,
      total_attempted = greatest(public.excel_import_batches.total_attempted, excluded.total_attempted),
      imported_count = public.excel_import_batches.imported_count + excluded.imported_count,
      status = case when excluded.status = 'COMPLETE' then 'COMPLETE' else 'PARTIAL' end,
      imported_by = excluded.imported_by,
      imported_at = now()
  where public.excel_import_batches.status = 'PARTIAL';
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    perform public.log_audit(
      'EXCEL_' || upper(import_target) || '_IMPORT',
      'EXCEL_IMPORT_BATCH',
      null,
      null,
      jsonb_build_object(
        'target', import_target,
        'file_name', import_file_name,
        'file_hash', import_file_hash,
        'total_attempted', import_total_attempted,
        'imported_count', import_imported_count,
        'status', case when import_complete then 'COMPLETE' else 'PARTIAL' end
      ),
      'Importación desde libro Excel',
      null
    );
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.has_excel_import(text, text) from public, anon, authenticated;
revoke all on function public.record_excel_import(text, text, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.has_excel_import(text, text) to authenticated;
grant execute on function public.record_excel_import(text, text, text, integer, integer, boolean) to authenticated;
