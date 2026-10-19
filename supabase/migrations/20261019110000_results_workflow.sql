alter table public.result_imports
  drop constraint if exists result_imports_sample_id_laboratory_id_file_hash_key,
  add constraint result_imports_sample_fkey
    foreign key (sample_id) references public.samples(id) on delete restrict;

create unique index result_imports_file_hash_unique
  on public.result_imports (sample_id, laboratory_id, file_hash)
  where file_hash is not null;

alter table public.results
  add constraint results_sample_fkey
    foreign key (sample_id) references public.samples(id) on delete restrict,
  add column source_import_row_id uuid
    references public.import_rows(id) on delete restrict;

alter table public.import_rows
  add column external_uncertainty text,
  add column external_lcm numeric,
  add column external_method text,
  add column external_technique text,
  add column analysis_start timestamptz,
  add column analysis_end timestamptz;

create unique index results_import_row_unique
  on public.results (source_import_row_id)
  where source_import_row_id is not null;

create or replace function public.audit_result_workflow_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public.log_audit(
    case
      when tg_table_name = 'result_imports' and tg_op = 'INSERT' then 'RESULT_IMPORT_CREATED'
      when tg_table_name = 'result_imports' then 'RESULT_IMPORT_STATUS_CHANGED'
      when tg_table_name = 'import_rows' and tg_op = 'INSERT' then 'RESULT_IMPORT_ROW_CREATED'
      when tg_table_name = 'import_rows' and new.confirmed and not old.confirmed then 'RESULT_CONFIRMED'
      when tg_table_name = 'results' then 'RESULT_CREATED'
      else 'RESULT_IMPORT_ROW_UPDATED'
    end,
    case
      when tg_table_name = 'result_imports' then 'RESULT_IMPORT'
      when tg_table_name = 'import_rows' then 'RESULT_IMPORT_ROW'
      else 'RESULT'
    end,
    case when tg_table_name = 'results' then new.id else new.id end,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger result_imports_audit_workflow
  after insert or update on public.result_imports
  for each row execute function public.audit_result_workflow_change();
create trigger import_rows_audit_workflow
  after insert or update on public.import_rows
  for each row execute function public.audit_result_workflow_change();
create trigger results_audit_workflow
  after insert on public.results
  for each row execute function public.audit_result_workflow_change();

create or replace function public.save_result_import(
  import_payload jsonb,
  rows_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  target_sample_id uuid;
  target_laboratory_id uuid;
  target_source_type text;
  target_file_hash text;
  new_import_id uuid;
  existing_import_id uuid;
  row_item jsonb;
  row_number integer := 0;
begin
  if auth.uid() is null or not public.has_any_role(array['ANALISTA', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Se requiere el rol ANALISTA o ADMIN activo.';
  end if;
  if jsonb_typeof(import_payload) is distinct from 'object'
    or jsonb_typeof(rows_payload) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Los datos de importación no son válidos.';
  end if;

  target_sample_id := nullif(import_payload ->> 'sample_id', '')::uuid;
  target_laboratory_id := nullif(import_payload ->> 'laboratory_id', '')::uuid;
  target_source_type := import_payload ->> 'source_type';
  target_file_hash := nullif(import_payload ->> 'file_hash', '');
  if target_sample_id is null or target_laboratory_id is null
    or target_source_type not in ('PDF', 'PASTE', 'MANUAL') then
    raise exception using errcode = '22023', message = 'Muestra, laboratorio y origen son obligatorios.';
  end if;
  if target_file_hash is not null and target_file_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'El SHA-256 del archivo no es válido.';
  end if;
  if not exists (select 1 from public.samples where id = target_sample_id)
    or not exists (
      select 1 from public.laboratories
       where id = target_laboratory_id and active
    ) then
    raise exception using errcode = '22023', message = 'La muestra o el laboratorio no está disponible.';
  end if;

  if target_file_hash is not null then
    select id into existing_import_id
      from public.result_imports
     where sample_id = target_sample_id
       and laboratory_id = target_laboratory_id
       and file_hash = target_file_hash
     for update;
    if found then
      return jsonb_build_object(
        'import_id', existing_import_id,
        'duplicate', true
      );
    end if;
  end if;

  insert into public.result_imports (
    sample_id, laboratory_id, source_type, storage_path, file_name,
    file_hash, adapter_code, adapter_version, import_status, raw_payload,
    created_by, updated_by
  )
  values (
    target_sample_id,
    target_laboratory_id,
    target_source_type,
    nullif(import_payload ->> 'storage_path', ''),
    nullif(import_payload ->> 'file_name', ''),
    target_file_hash,
    nullif(import_payload ->> 'adapter_code', ''),
    nullif(import_payload ->> 'adapter_version', ''),
    'PROCESSING',
    import_payload -> 'raw_payload',
    auth.uid(),
    auth.uid()
  )
  returning id into new_import_id;

  for row_item in select value from jsonb_array_elements(rows_payload)
  loop
    row_number := row_number + 1;
    insert into public.import_rows (
      result_import_id, row_number, external_parameter, external_unit,
      external_result, mapped_test_id, mapping_status, validation_messages,
      external_uncertainty, external_lcm, external_method, external_technique,
      analysis_start, analysis_end, confirmed, created_by, updated_by
    )
    values (
      new_import_id,
      row_number,
      nullif(row_item ->> 'external_parameter', ''),
      nullif(row_item ->> 'external_unit', ''),
      nullif(row_item ->> 'external_result', ''),
      nullif(row_item ->> 'mapped_test_id', '')::uuid,
      coalesce(nullif(row_item ->> 'mapping_status', ''), 'UNMAPPED'),
      coalesce(row_item -> 'validation_messages', '[]'::jsonb),
      nullif(row_item ->> 'external_uncertainty', ''),
      nullif(row_item ->> 'external_lcm', '')::numeric,
      nullif(row_item ->> 'external_method', ''),
      nullif(row_item ->> 'external_technique', ''),
      nullif(row_item ->> 'analysis_start', '')::timestamptz,
      nullif(row_item ->> 'analysis_end', '')::timestamptz,
      false,
      auth.uid(),
      auth.uid()
    );
  end loop;

  if row_number = 0 then
    raise exception using errcode = '22023', message = 'La importación debe contener al menos una fila.';
  end if;
  return jsonb_build_object('import_id', new_import_id, 'duplicate', false);
end;
$$;

create or replace function public.set_result_import_status(
  target_import_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null or not public.has_any_role(array['ANALISTA', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Se requiere el rol ANALISTA o ADMIN activo.';
  end if;
  if target_status not in ('PROCESSING', 'PARTIAL', 'COMPLETED', 'FAILED') then
    raise exception using errcode = '22023', message = 'Estado de importación no válido.';
  end if;

  update public.result_imports
     set import_status = target_status,
         updated_by = auth.uid()
   where id = target_import_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró la importación.';
  end if;
end;
$$;

create or replace function public.confirm_result_import_row(
  target_import_row_id uuid,
  target_test_id uuid,
  result_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  import_row public.import_rows%rowtype;
  import_record public.result_imports%rowtype;
  selected_test public.tests%rowtype;
  existing_result_id uuid;
begin
  if auth.uid() is null or not public.has_any_role(array['ANALISTA', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Se requiere el rol ANALISTA o ADMIN activo.';
  end if;
  if target_import_row_id is null or target_test_id is null
    or jsonb_typeof(result_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Fila, ensayo y resultado son obligatorios.';
  end if;

  select * into import_row
    from public.import_rows
   where id = target_import_row_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró la fila de importación.';
  end if;

  select * into import_record
    from public.result_imports
   where id = import_row.result_import_id
   for update;

  select id into existing_result_id
    from public.results
   where source_import_row_id = import_row.id;
  if found then
    return existing_result_id;
  end if;
  if import_row.confirmed then
    raise exception using errcode = '23505', message = 'La fila ya fue confirmada.';
  end if;
  if nullif(btrim(import_row.external_result), '') is null then
    raise exception using errcode = '22023', message = 'La fila no contiene un resultado original.';
  end if;

  select * into selected_test
    from public.tests
   where id = target_test_id and active and code ~ '^SA';
  if not found then
    raise exception using errcode = '22023', message = 'Seleccione un ensayo SA vigente.';
  end if;
  if not exists (
    select 1
      from public.sample_tests as sample_test
     where sample_test.sample_id = import_record.sample_id
       and sample_test.test_id = target_test_id
       and (
         sample_test.execution_type <> 'SUBCONTRACTED'
         or sample_test.assigned_laboratory_id = import_record.laboratory_id
       )
  ) then
    raise exception using errcode = '22023', message = 'El ensayo no fue solicitado para esta muestra y laboratorio.';
  end if;

  insert into public.results (
    sample_id, test_id, laboratory_id, operator, numeric_value,
    original_text, reported_text, unit, lcm, uncertainty_text,
    method_text, technique_text, accreditation_type, analysis_start,
    analysis_end, source_import_id, source_import_row_id, source_page,
    entry_mechanism, status, entered_by, created_by, updated_by
  )
  values (
    import_record.sample_id,
    target_test_id,
    import_record.laboratory_id,
    nullif(result_payload ->> 'operator', ''),
    nullif(result_payload ->> 'numeric_value', '')::numeric,
    import_row.external_result,
    import_row.external_result,
    import_row.external_unit,
    import_row.external_lcm,
    import_row.external_uncertainty,
    import_row.external_method,
    import_row.external_technique,
    nullif(result_payload ->> 'accreditation_type', ''),
    import_row.analysis_start,
    import_row.analysis_end,
    import_record.id,
    import_row.id,
    nullif(result_payload ->> 'source_page', '')::integer,
    case import_record.source_type
      when 'PDF' then 'IMPORTED'
      when 'PASTE' then 'PASTE'
      else 'MANUAL'
    end,
    'CONFIRMED',
    auth.uid(),
    auth.uid(),
    auth.uid()
  )
  returning id into existing_result_id;

  update public.import_rows
     set mapped_test_id = target_test_id,
         mapping_status = 'CONFIRMED',
         confirmed = true,
         updated_by = auth.uid()
   where id = import_row.id;

  update public.result_imports as current_import
     set import_status = case
       when not exists (
         select 1
           from public.import_rows as pending_row
          where pending_row.result_import_id = import_record.id
            and not pending_row.confirmed
       ) then 'COMPLETED'
       else 'PARTIAL'
     end,
     updated_by = auth.uid()
   where current_import.id = import_record.id;

  return existing_result_id;
end;
$$;

create or replace function public.record_result_correction(
  target_result_id uuid,
  corrected_data jsonb,
  correction_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  current_result public.results%rowtype;
  correction_id uuid;
begin
  if auth.uid() is null or not public.has_any_role(array['ANALISTA', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Se requiere el rol ANALISTA o ADMIN activo.';
  end if;
  if nullif(btrim(correction_reason), '') is null
    or jsonb_typeof(corrected_data) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'La corrección requiere datos y un motivo.';
  end if;
  if exists (
    select 1 from jsonb_object_keys(corrected_data) as item(key_name)
     where key_name not in (
       'operator', 'numeric_value', 'reported_text', 'unit', 'lcm',
       'uncertainty_text', 'method_text', 'technique_text',
       'accreditation_type', 'analysis_start', 'analysis_end'
     )
  ) then
    raise exception using errcode = '22023', message = 'La corrección contiene campos no permitidos.';
  end if;

  select * into current_result
    from public.results
   where id = target_result_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró el resultado original.';
  end if;

  insert into public.result_corrections (
    result_id, old_data, new_data, reason, corrected_by
  )
  values (
    current_result.id,
    to_jsonb(current_result),
    corrected_data,
    btrim(correction_reason),
    auth.uid()
  )
  returning id into correction_id;

  perform public.log_audit(
    'RESULT_CORRECTION_CREATED',
    'RESULT',
    current_result.id,
    to_jsonb(current_result),
    corrected_data,
    btrim(correction_reason)
  );
  return correction_id;
end;
$$;

drop policy if exists source_files_result_upload on storage.objects;
create policy source_files_result_upload
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'source-files'
    and name ~ '^samples/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-[A-Za-z0-9_. -]+$'
    and public.has_any_role(array['ANALISTA', 'ADMIN'])
    and exists (
      select 1 from public.samples as sample
       where sample.id::text = split_part(storage.objects.name, '/', 2)
    )
    and exists (
      select 1 from public.app_settings as setting
       where setting.key = 'sample.field.max_attachment_size_bytes'
         and (setting.value #>> '{}') ~ '^[0-9]+$'
         and coalesce(nullif(storage.objects.metadata ->> 'size', '')::bigint, 0)
             <= (setting.value #>> '{}')::bigint
    )
  );

revoke insert, update on public.result_imports, public.import_rows from authenticated;
revoke insert, update on public.results from authenticated;
revoke insert on public.result_corrections from authenticated;
grant select on public.result_imports, public.import_rows, public.results, public.result_corrections to authenticated;

revoke all on function public.audit_result_workflow_change() from public, anon, authenticated;
revoke all on function public.save_result_import(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.set_result_import_status(uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_result_import_row(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.record_result_correction(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_result_import(jsonb, jsonb) to authenticated;
grant execute on function public.set_result_import_status(uuid, text) to authenticated;
grant execute on function public.confirm_result_import_row(uuid, uuid, jsonb) to authenticated;
grant execute on function public.record_result_correction(uuid, jsonb, text) to authenticated;
