insert into public.app_settings (key, value, description)
values
  (
    'sample.field.max_attachment_size_bytes',
    to_jsonb(10485760::bigint),
    'Tamaño máximo configurable para adjuntos de muestras, expresado en bytes.'
  ),
  (
    'sample.field.photo_evidence_enabled',
    'false'::jsonb,
    'Habilita fotos como evidencia mientras se define la política RF-CAM-005.'
  )
on conflict (key) do nothing;

alter table public.sample_field_data
  alter column coordinate_state set not null,
  add constraint sample_field_data_sample_fkey
    foreign key (sample_id) references public.samples(id) on delete restrict,
  add constraint sample_field_data_coordinate_pair_check
    check (
      (coordinate_state = 'NORMALIZED'
        and latitude_normalized is not null
        and longitude_normalized is not null)
      or
      (coordinate_state <> 'NORMALIZED'
        and latitude_normalized is null
        and longitude_normalized is null)
    );

alter table public.sample_field_measurements
  add constraint sample_field_measurements_sample_fkey
    foreign key (sample_id) references public.samples(id) on delete restrict,
  add constraint sample_field_measurements_parameter_unique
    unique (sample_id, field_parameter_id);

alter table public.sample_attachments
  add constraint sample_attachments_sample_fkey
    foreign key (sample_id) references public.samples(id) on delete restrict,
  add constraint sample_attachments_storage_path_unique unique (storage_path),
  add constraint sample_attachments_sha256_check check (sha256 ~ '^[0-9a-f]{64}$');

create index sample_attachments_sample_id_created_at_idx
  on public.sample_attachments (sample_id, created_at desc);

create or replace function public.save_sample_field_data(
  target_sample_id uuid,
  field_data jsonb,
  field_measurements jsonb,
  edit_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  sample_status text;
  old_data jsonb;
  old_measurements jsonb;
  latitude_text text;
  longitude_text text;
  latitude_value numeric;
  longitude_value numeric;
  coordinate_status text;
  measurement_item jsonb;
  parameter_id uuid;
  measurement_state text;
  measurement_value numeric;
  saved_measurements jsonb;
begin
  if auth.uid() is null or not public.has_role('MUESTREO') then
    raise exception using errcode = '42501', message = 'Se requiere el rol MUESTREO activo.';
  end if;
  if target_sample_id is null
    or jsonb_typeof(field_data) is distinct from 'object'
    or jsonb_typeof(field_measurements) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Datos de campo no válidos.';
  end if;

  select sample.status
    into sample_status
    from public.samples as sample
   where sample.id = target_sample_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró la muestra.';
  end if;

  if sample_status <> 'PENDING_REVIEW'
    and nullif(btrim(edit_reason), '') is null then
    raise exception using errcode = '22023', message = 'Se requiere un motivo para editar datos después de la recepción.';
  end if;

  select to_jsonb(field_row)
    into old_data
    from public.sample_field_data as field_row
   where field_row.sample_id = target_sample_id;
  select coalesce(jsonb_agg(to_jsonb(measurement_row)), '[]'::jsonb)
    into old_measurements
    from public.sample_field_measurements as measurement_row
   where measurement_row.sample_id = target_sample_id;

  latitude_text := nullif(field_data ->> 'latitude_original', '');
  longitude_text := nullif(field_data ->> 'longitude_original', '');
  latitude_value := nullif(field_data ->> 'latitude_normalized', '')::numeric;
  longitude_value := nullif(field_data ->> 'longitude_normalized', '')::numeric;
  coordinate_status := field_data ->> 'coordinate_state';

  if coordinate_status not in ('NORMALIZED', 'AMBIGUOUS', 'INVALID', 'PENDING') then
    raise exception using errcode = '22023', message = 'Estado de coordenadas no válido.';
  end if;
  if coordinate_status = 'NORMALIZED'
    and (latitude_value is null or longitude_value is null) then
    raise exception using errcode = '22023', message = 'Las coordenadas normalizadas están incompletas.';
  end if;
  if coordinate_status <> 'NORMALIZED'
    and (latitude_value is not null or longitude_value is not null) then
    raise exception using errcode = '22023', message = 'No se pueden guardar coordenadas normalizadas ambiguas o inválidas.';
  end if;

  insert into public.sample_field_data (
    sample_id,
    latitude_original,
    longitude_original,
    latitude_normalized,
    longitude_normalized,
    coordinate_state,
    collected_by,
    notes,
    created_by,
    updated_by
  )
  values (
    target_sample_id,
    latitude_text,
    longitude_text,
    latitude_value,
    longitude_value,
    coordinate_status,
    nullif(field_data ->> 'collected_by', '')::uuid,
    nullif(field_data ->> 'notes', ''),
    auth.uid(),
    auth.uid()
  )
  on conflict (sample_id) do update set
    latitude_original = excluded.latitude_original,
    longitude_original = excluded.longitude_original,
    latitude_normalized = excluded.latitude_normalized,
    longitude_normalized = excluded.longitude_normalized,
    coordinate_state = excluded.coordinate_state,
    collected_by = excluded.collected_by,
    notes = excluded.notes,
    updated_by = auth.uid();

  for measurement_item in
    select value from jsonb_array_elements(field_measurements)
  loop
    parameter_id := nullif(measurement_item ->> 'field_parameter_id', '')::uuid;
    measurement_state := measurement_item ->> 'value_state';
    measurement_value := nullif(measurement_item ->> 'numeric_value', '')::numeric;

    if parameter_id is null
      or measurement_state not in ('VALUE', 'NOT_APPLICABLE', 'NOT_REPORTED', 'NOT_SPECIFIED', 'PENDING')
      or not exists (
        select 1
          from public.field_parameters as parameter
         where parameter.id = parameter_id
           and parameter.active
      ) then
      raise exception using errcode = '22023', message = 'Parámetro o estado de medición no válido.';
    end if;
    if (measurement_state = 'VALUE' and measurement_value is null)
      or (measurement_state <> 'VALUE' and measurement_value is not null) then
      raise exception using errcode = '22023', message = 'El valor numérico debe existir solo para mediciones VALUE.';
    end if;

    insert into public.sample_field_measurements (
      sample_id,
      field_parameter_id,
      value_state,
      numeric_value,
      unit,
      original_text,
      created_by,
      updated_by
    )
    values (
      target_sample_id,
      parameter_id,
      measurement_state,
      measurement_value,
      nullif(measurement_item ->> 'unit', ''),
      nullif(measurement_item ->> 'original_text', ''),
      auth.uid(),
      auth.uid()
    )
    on conflict (sample_id, field_parameter_id) do update set
      value_state = excluded.value_state,
      numeric_value = excluded.numeric_value,
      unit = excluded.unit,
      original_text = excluded.original_text,
      updated_by = auth.uid();
  end loop;

  select coalesce(jsonb_agg(to_jsonb(measurement_row)), '[]'::jsonb)
    into saved_measurements
    from public.sample_field_measurements as measurement_row
   where measurement_row.sample_id = target_sample_id;

  perform public.log_audit(
    case when old_data is null then 'SAMPLE_FIELD_DATA_CREATED' else 'SAMPLE_FIELD_DATA_UPDATED' end,
    'SAMPLE_FIELD_DATA',
    target_sample_id,
    jsonb_build_object('field_data', old_data, 'measurements', old_measurements),
    jsonb_build_object(
      'field_data', (select to_jsonb(field_row) from public.sample_field_data as field_row where field_row.sample_id = target_sample_id),
      'measurements', saved_measurements
    ),
    nullif(btrim(edit_reason), '')
  );

  return jsonb_build_object('ok', true, 'sample_id', target_sample_id);
end;
$$;

create or replace function public.register_sample_attachment(
  target_sample_id uuid,
  target_attachment_type text,
  target_storage_path text,
  target_file_name text,
  target_file_type text,
  target_file_size bigint,
  target_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, storage
as $$
declare
  attachment_id uuid;
  max_size bigint;
begin
  if auth.uid() is null or not public.has_any_role(array['RECEPCION', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Se requiere el rol RECEPCION o ADMIN activo.';
  end if;
  if target_attachment_type not in ('SOLICITUD', 'CADENA_CUSTODIA', 'FORMATO_CAMPO', 'FOTO', 'OTRO')
    or target_file_type not in ('pdf', 'jpg', 'jpeg', 'png', 'csv', 'xlsx')
    or target_file_size is null
    or target_file_size <= 0
    or target_sha256 !~ '^[0-9a-f]{64}$'
    or target_file_name is null
    or btrim(target_file_name) = ''
    or target_storage_path !~ (
      '^samples/' || target_sample_id::text || '/[0-9a-fA-F-]{36}-[A-Za-z0-9_. -]+$'
    ) then
    raise exception using errcode = '22023', message = 'Los metadatos del adjunto no son válidos.';
  end if;

  select (setting.value #>> '{}')::bigint
    into max_size
    from public.app_settings as setting
   where setting.key = 'sample.field.max_attachment_size_bytes';
  if max_size is null or target_file_size > max_size then
    raise exception using errcode = '22023', message = 'El adjunto supera el máximo configurado.';
  end if;

  if target_attachment_type = 'FOTO' then
    if not exists (
      select 1 from public.app_settings as setting
       where setting.key = 'sample.field.photo_evidence_enabled'
         and setting.value = 'true'::jsonb
    ) then
      raise exception using errcode = '42501', message = 'La carga de fotos como evidencia está deshabilitada.';
    end if;
    if target_file_type not in ('jpg', 'jpeg', 'png') then
      raise exception using errcode = '22023', message = 'Las fotos solo pueden ser JPG o PNG.';
    end if;
  end if;

  if not exists (select 1 from public.samples where id = target_sample_id) then
    raise exception using errcode = 'P0002', message = 'No se encontró la muestra.';
  end if;
  if not exists (
    select 1
      from storage.objects as object
     where object.bucket_id = 'source-files'
       and object.name = target_storage_path
  ) then
    raise exception using errcode = 'P0002', message = 'No se encontró el archivo cargado en Storage.';
  end if;

  insert into public.sample_attachments (
    sample_id,
    attachment_type,
    storage_path,
    file_name,
    file_type,
    file_size,
    sha256,
    uploaded_by,
    created_by,
    updated_by
  )
  values (
    target_sample_id,
    target_attachment_type,
    target_storage_path,
    target_file_name,
    target_file_type,
    target_file_size,
    target_sha256,
    auth.uid(),
    auth.uid(),
    auth.uid()
  )
  returning id into attachment_id;

  perform public.log_audit(
    'SAMPLE_ATTACHMENT_ADDED',
    'SAMPLE_ATTACHMENT',
    attachment_id,
    null,
    jsonb_build_object(
      'sample_id', target_sample_id,
      'attachment_type', target_attachment_type,
      'storage_path', target_storage_path,
      'file_name', target_file_name,
      'file_type', target_file_type,
      'file_size', target_file_size,
      'sha256', target_sha256
    )
  );
  return attachment_id;
end;
$$;

create or replace function public.retire_sample_attachment(
  target_attachment_id uuid,
  withdrawal_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  previous_data jsonb;
  updated_data jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['RECEPCION', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Se requiere el rol RECEPCION o ADMIN activo.';
  end if;
  if nullif(btrim(withdrawal_reason), '') is null then
    raise exception using errcode = '22023', message = 'Se requiere el motivo de retiro.';
  end if;

  select to_jsonb(attachment)
    into previous_data
    from public.sample_attachments as attachment
   where attachment.id = target_attachment_id
   for update;
  if previous_data is null then
    raise exception using errcode = 'P0002', message = 'No se encontró el adjunto.';
  end if;

  update public.sample_attachments
     set withdrawn = true,
         withdrawn_reason = btrim(withdrawal_reason),
         updated_by = auth.uid()
   where id = target_attachment_id
   returning to_jsonb(sample_attachments.*) into updated_data;

  perform public.log_audit(
    'SAMPLE_ATTACHMENT_WITHDRAWN',
    'SAMPLE_ATTACHMENT',
    target_attachment_id,
    previous_data,
    updated_data,
    btrim(withdrawal_reason)
  );
  return jsonb_build_object('ok', true, 'attachment_id', target_attachment_id);
end;
$$;

create or replace function public.audit_field_parameter_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public.log_audit(
    case when tg_op = 'INSERT' then 'FIELD_PARAMETER_CREATED' else 'FIELD_PARAMETER_UPDATED' end,
    'FIELD_PARAMETER',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger field_parameters_audit_change
  after insert or update on public.field_parameters
  for each row execute function public.audit_field_parameter_change();

drop policy if exists "sample_attachments: read" on public.sample_attachments;
create policy "sample_attachments: read"
  on public.sample_attachments for select to authenticated
  using (public.has_any_role(array[
    'ADMIN', 'RECEPCION', 'ANALISTA', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'
  ]));

revoke all on public.field_parameters, public.sample_field_data,
  public.sample_field_measurements, public.sample_attachments
  from anon, authenticated;
grant select on public.field_parameters, public.sample_field_data,
  public.sample_field_measurements, public.sample_attachments
  to authenticated;
grant insert, update on public.field_parameters to authenticated;

revoke all on function public.save_sample_field_data(uuid, jsonb, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.register_sample_attachment(uuid, text, text, text, text, bigint, text)
  from public, anon, authenticated;
revoke all on function public.retire_sample_attachment(uuid, text)
  from public, anon, authenticated;
revoke all on function public.audit_field_parameter_change()
  from public, anon, authenticated;

grant execute on function public.save_sample_field_data(uuid, jsonb, jsonb, text)
  to authenticated;
grant execute on function public.register_sample_attachment(uuid, text, text, text, text, bigint, text)
  to authenticated;
grant execute on function public.retire_sample_attachment(uuid, text)
  to authenticated;
