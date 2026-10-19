-- p09: versioned regulations, draft CSV imports and sample-level confirmation.

alter table public.sample_regulations
  add column if not exists suggested_regulation_name text,
  add column if not exists suggested_article text,
  add column if not exists suggested_activity text,
  add column if not exists suggested_discharge_type text,
  add column if not exists decision_reason text,
  add constraint sample_regulations_suggested_discharge_type_check
    check (suggested_discharge_type is null or suggested_discharge_type in ('ARD', 'ARnD', 'NA'));

alter table public.sample_regulations
  add constraint sample_regulations_quote_fkey
    foreign key (suggested_from_quote_id) references public.quotes(id) on delete restrict;

create unique index if not exists regulation_limits_activity_test_unique
  on public.regulation_limits (activity_id, test_id);

alter table public.reconciliation_issues
  drop constraint if exists reconciliation_issues_issue_type_check,
  add constraint reconciliation_issues_issue_type_check check (issue_type in (
    'DATE_MISMATCH', 'MATRIX_MISMATCH', 'UNREQUESTED_PARAMETER',
    'MISSING_RESULT', 'LCM_MISMATCH', 'METHOD_MISMATCH', 'UNIT_MISMATCH',
    'TECHNIQUE_MISMATCH', 'DUPLICATE_RESULT', 'LAB_DEVIATION',
    'LEGACY_CODE_NO_MAPPING', 'INCOMPLETE_TEST_FIELDS',
    'EXTERNAL_REPORT_PENDING', 'REGULATION_MISMATCH'
  ));

insert into public.regulation_versions (
  regulation_id, version_name, valid_from, status
)
select regulation.id, 'Estructura de artículos 8 a 16', date '2015-01-01', 'DRAFT'
  from public.regulations regulation
 where regulation.code = 'RES_631_2015'
   and not exists (
     select 1 from public.regulation_versions version
      where version.regulation_id = regulation.id
        and version.version_name = 'Estructura de artículos 8 a 16'
   );

insert into public.regulation_activities (
  regulation_version_id, article, activity, description
)
select version.id, article.number, 'Pendiente de transcripción oficial',
       'Estructura de artículo. Cargar actividad y límites desde la fuente oficial; sin valores normativos precargados.'
  from public.regulation_versions version
  cross join generate_series(8, 16) as article(number)
 where version.version_name = 'Estructura de artículos 8 a 16'
   and version.status = 'DRAFT'
   and not exists (
     select 1 from public.regulation_activities activity
      where activity.regulation_version_id = version.id
        and activity.article = article.number::text
        and activity.activity = 'Pendiente de transcripción oficial'
   );

create or replace function public.import_regulation_csv(
  p_version_name text,
  p_valid_from date,
  p_valid_until date,
  p_import_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  regulation_id uuid;
  new_version_id uuid;
  row_data jsonb;
  row_number integer;
  test_record public.tests%rowtype;
  activity_id uuid;
  limit_number numeric;
  special_code text;
  operator_code text;
  errors jsonb := '[]'::jsonb;
  imported_count integer := 0;
  error_text text;
begin
  if auth.uid() is null or not public.has_role('ADMIN') then
    raise exception using errcode = '42501', message = 'Se requiere el rol ADMIN para importar normativa.';
  end if;
  if nullif(btrim(p_version_name), '') is null
    or p_import_rows is null
    or (p_valid_from is not null and p_valid_until is not null and p_valid_until < p_valid_from) then
    raise exception using errcode = '22023', message = 'La versión o las filas CSV no son válidas.';
  end if;
  if jsonb_typeof(p_import_rows) is distinct from 'array'
    or jsonb_array_length(p_import_rows) > 5000 then
    raise exception using errcode = '22023', message = 'El CSV debe contener un arreglo con máximo 5000 filas.';
  end if;

  select id into regulation_id
    from public.regulations
   where code = 'RES_631_2015'
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No existe la estructura de Resolución 631 de 2015.';
  end if;

  insert into public.regulation_versions (
    regulation_id, version_name, valid_from, valid_until, status, created_by, updated_by
  )
  values (
    regulation_id, btrim(p_version_name), p_valid_from, p_valid_until, 'DRAFT', auth.uid(), auth.uid()
  )
  returning id into new_version_id;

  for row_data in select value from jsonb_array_elements(p_import_rows)
  loop
    row_number := 0;
    begin
      row_number := coalesce(nullif(row_data ->> 'row_number', '')::integer, 0);
      if nullif(btrim(row_data ->> 'article'), '') is null
        or nullif(btrim(row_data ->> 'activity'), '') is null
        or coalesce(row_data ->> 'discharge_type', '') not in ('ARD', 'ARnD', 'NA')
        or nullif(btrim(row_data ->> 'test_code'), '') is null then
        raise exception using errcode = '22023',
          message = 'Artículo, actividad, tipo de descarga y código de ensayo son obligatorios.';
      end if;

      select * into test_record
        from public.tests
       where code = btrim(row_data ->> 'test_code')
         and active
         and code ~ '^SA';
      if not found then
        raise exception using errcode = '22023',
          message = 'El código de ensayo no existe, no está activo o no comienza por SA.';
      end if;

      special_code := nullif(btrim(row_data ->> 'special_value'), '');
      operator_code := nullif(btrim(row_data ->> 'limit_operator'), '');
      if special_code is not null then
        if special_code not in ('N_A', 'N_E', 'N_R', 'NOT_SPECIFIED', 'ANALYSIS_AND_REPORT', 'NONE')
          or nullif(btrim(row_data ->> 'limit_value'), '') is not null
          or operator_code is not null then
          raise exception using errcode = '22023',
            message = 'Un valor especial válido no puede combinarse con operador o valor numérico.';
        end if;
        limit_number := null;
      else
        if coalesce(operator_code, '') not in ('<', '<=', '>', '>=', '=')
          or coalesce(row_data ->> 'limit_value', '') !~ '^-?[0-9]+([.][0-9]+)?$' then
          raise exception using errcode = '22023',
            message = 'Indique operador y límite numérico con punto decimal, o un valor especial.';
        end if;
        limit_number := (row_data ->> 'limit_value')::numeric;
      end if;

      select id into activity_id
        from public.regulation_activities
       where regulation_version_id = new_version_id
         and article = btrim(row_data ->> 'article')
         and activity = btrim(row_data ->> 'activity')
         and discharge_type = row_data ->> 'discharge_type'
         and description is not distinct from nullif(btrim(row_data ->> 'description'), '');

      if activity_id is null then
        insert into public.regulation_activities (
          regulation_version_id, article, activity, discharge_type, description,
          created_by, updated_by
        )
        values (
          new_version_id, btrim(row_data ->> 'article'), btrim(row_data ->> 'activity'),
          row_data ->> 'discharge_type', nullif(btrim(row_data ->> 'description'), ''),
          auth.uid(), auth.uid()
        )
        returning id into activity_id;
      end if;

      insert into public.regulation_limits (
        activity_id, test_id, limit_operator, limit_value, limit_text, unit,
        special_value, created_by, updated_by
      )
      values (
        activity_id, test_record.id, operator_code, limit_number,
        nullif(btrim(row_data ->> 'limit_text'), ''),
        nullif(btrim(row_data ->> 'unit'), ''),
        special_code, auth.uid(), auth.uid()
      );
      imported_count := imported_count + 1;
    exception
      when invalid_parameter_value
        or invalid_text_representation
        or numeric_value_out_of_range
        or check_violation
        or unique_violation
        or foreign_key_violation
        or raise_exception then
        get stacked diagnostics error_text = message_text;
        errors := errors || jsonb_build_array(jsonb_build_object(
          'row', row_number,
          'message', error_text
        ));
    end;
    activity_id := null;
  end loop;
  perform public.log_audit(
    'REGULATION_VERSION_IMPORTED',
    'REGULATION_VERSION',
    new_version_id,
    null,
    jsonb_build_object(
      'status', 'DRAFT',
      'version_name', btrim(p_version_name),
      'imported_rows', imported_count,
      'errors', jsonb_array_length(errors)
    ),
    'Importación CSV de normativa'
  );

  return jsonb_build_object(
    'version_id', new_version_id,
    'imported_count', imported_count,
    'errors', errors,
    'status', 'DRAFT'
  );
end;
$$;

create or replace function public.activate_regulation_version(target_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  version_record public.regulation_versions%rowtype;
begin
  if auth.uid() is null or not public.has_role('ADMIN') then
    raise exception using errcode = '42501', message = 'Se requiere el rol ADMIN para activar normativa.';
  end if;

  select * into version_record
    from public.regulation_versions
   where id = target_version_id
   for update;
  if not found or version_record.status <> 'DRAFT' then
    raise exception using errcode = 'P0002', message = 'La versión no existe o no está en borrador.';
  end if;
  if not exists (
    select 1
      from public.regulation_activities activity
      join public.regulation_limits limit_record on limit_record.activity_id = activity.id
     where activity.regulation_version_id = target_version_id
  ) then
    raise exception using errcode = '22023', message = 'La versión no contiene actividades y límites importados.';
  end if;

  update public.regulation_versions
     set status = 'ACTIVE', updated_by = auth.uid()
   where id = version_record.id;
  perform public.log_audit(
    'REGULATION_VERSION_ACTIVATED',
    'REGULATION_VERSION',
    version_record.id,
    to_jsonb(version_record),
    to_jsonb(version_record) || jsonb_build_object('status', 'ACTIVE'),
    'Activación administrativa de normativa'
  );

  return jsonb_build_object('ok', true, 'status', 'ACTIVE');
end;
$$;

create or replace function public.confirm_sample_regulations(
  target_sample_id uuid,
  selections jsonb,
  decision_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  sample_record public.samples%rowtype;
  selection jsonb;
  selected_activity public.regulation_activities%rowtype;
  selected_version public.regulation_versions%rowtype;
  selected_regulation public.regulations%rowtype;
  quote_regulations jsonb;
  selected_summary jsonb := '[]'::jsonb;
  suggested_summary jsonb := '[]'::jsonb;
  suggestion jsonb;
  is_quote_match boolean;
  has_difference boolean := false;
  assigned_order integer;
  new_sample_regulation public.sample_regulations%rowtype;
  matched_suggestion jsonb;
  issue_id uuid;
  reason_text text := nullif(btrim(decision_reason), '');
begin
  if auth.uid() is null or not public.has_any_role(array['ANALISTA', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Se requiere el rol ANALISTA o ADMIN para confirmar normativa.';
  end if;
  if selections is null
    or jsonb_typeof(selections) is distinct from 'array'
    or jsonb_array_length(selections) = 0 then
    raise exception using errcode = '22023', message = 'Seleccione al menos una actividad normativa.';
  end if;

  select * into sample_record
    from public.samples
   where id = target_sample_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró la muestra.';
  end if;

  select case
      when jsonb_typeof(reception.request_review #> '{quote_suggestions,regulations}') = 'array'
        then reception.request_review #> '{quote_suggestions,regulations}'
      else '[]'::jsonb
    end
    into quote_regulations
    from public.sample_receptions reception
   where reception.sample_id = target_sample_id;
  quote_regulations := coalesce(quote_regulations, '[]'::jsonb);

  for selection in select value from jsonb_array_elements(selections)
  loop
    select * into selected_activity
      from public.regulation_activities
     where id = nullif(selection ->> 'activity_id', '')::uuid;
    if not found then
      raise exception using errcode = 'P0002', message = 'No se encontró la actividad normativa seleccionada.';
    end if;

    select * into selected_version
      from public.regulation_versions
     where id = selected_activity.regulation_version_id
       and status = 'ACTIVE'
       and (valid_from is null or valid_from <= current_date)
       and (valid_until is null or valid_until >= current_date)
       for share;
    if not found then
      raise exception using errcode = '22023', message = 'Seleccione una actividad de una versión vigente y activa.';
    end if;
    select * into selected_regulation
      from public.regulations
     where id = selected_version.regulation_id;
    is_quote_match := exists (
      select 1
        from jsonb_array_elements(quote_regulations) quote_item
       where lower(btrim(coalesce(quote_item ->> 'regulation_name', ''))) = lower(btrim(selected_regulation.name))
         and lower(btrim(coalesce(quote_item ->> 'article', ''))) = lower(btrim(selected_activity.article))
         and lower(btrim(coalesce(quote_item ->> 'activity', ''))) = lower(btrim(selected_activity.activity))
         and coalesce(quote_item ->> 'discharge_type', 'NA') = coalesce(selected_activity.discharge_type, 'NA')
    );
    if jsonb_array_length(quote_regulations) > 0 and not is_quote_match then
      has_difference := true;
    end if;

    selected_summary := selected_summary || jsonb_build_array(jsonb_build_object(
      'regulation_name', selected_regulation.name,
      'article', selected_activity.article,
      'activity', selected_activity.activity,
      'discharge_type', selected_activity.discharge_type
    ));
  end loop;

  for suggestion in select value from jsonb_array_elements(quote_regulations)
  loop
    if not exists (
      select 1
        from jsonb_array_elements(selected_summary) chosen
       where lower(btrim(coalesce(chosen ->> 'regulation_name', ''))) =
             lower(btrim(coalesce(suggestion ->> 'regulation_name', '')))
         and lower(btrim(coalesce(chosen ->> 'article', ''))) =
             lower(btrim(coalesce(suggestion ->> 'article', '')))
         and lower(btrim(coalesce(chosen ->> 'activity', ''))) =
             lower(btrim(coalesce(suggestion ->> 'activity', '')))
         and coalesce(chosen ->> 'discharge_type', 'NA') =
             coalesce(suggestion ->> 'discharge_type', 'NA')
    ) then
      has_difference := true;
    end if;
    suggested_summary := suggested_summary || jsonb_build_array(jsonb_build_object(
      'regulation_name', suggestion ->> 'regulation_name',
      'article', suggestion ->> 'article',
      'activity', suggestion ->> 'activity',
      'discharge_type', suggestion ->> 'discharge_type'
    ));
  end loop;
  if jsonb_array_length(quote_regulations) <> jsonb_array_length(selections) then
    has_difference := jsonb_array_length(quote_regulations) > 0;
  end if;

  if has_difference and reason_text is null then
    raise exception using errcode = '22023',
      message = 'La normativa seleccionada difiere de la cotización; registre el motivo de la decisión.';
  end if;

  select coalesce(max(column_order), 0) into assigned_order
    from public.sample_regulations
   where sample_id = target_sample_id;

  for selection in select value from jsonb_array_elements(selections)
  loop
    select * into selected_activity
      from public.regulation_activities
     where id = (selection ->> 'activity_id')::uuid;
    select * into selected_version
      from public.regulation_versions
     where id = selected_activity.regulation_version_id;
    select * into selected_regulation
      from public.regulations
     where id = selected_version.regulation_id;
    is_quote_match := exists (
      select 1
        from jsonb_array_elements(quote_regulations) quote_item
       where lower(btrim(coalesce(quote_item ->> 'regulation_name', ''))) = lower(btrim(selected_regulation.name))
         and lower(btrim(coalesce(quote_item ->> 'article', ''))) = lower(btrim(selected_activity.article))
         and lower(btrim(coalesce(quote_item ->> 'activity', ''))) = lower(btrim(selected_activity.activity))
         and coalesce(quote_item ->> 'discharge_type', 'NA') = coalesce(selected_activity.discharge_type, 'NA')
    );
    matched_suggestion := null;
    if is_quote_match then
      select quote_item into matched_suggestion
        from jsonb_array_elements(quote_regulations) quote_item
       where lower(btrim(coalesce(quote_item ->> 'regulation_name', ''))) = lower(btrim(selected_regulation.name))
         and lower(btrim(coalesce(quote_item ->> 'article', ''))) = lower(btrim(selected_activity.article))
         and lower(btrim(coalesce(quote_item ->> 'activity', ''))) = lower(btrim(selected_activity.activity))
         and coalesce(quote_item ->> 'discharge_type', 'NA') = coalesce(selected_activity.discharge_type, 'NA')
       limit 1;
    elsif jsonb_array_length(quote_regulations) > 0 then
      matched_suggestion := quote_regulations -> 0;
    end if;
    assigned_order := assigned_order + 1;
    insert into public.sample_regulations (
      sample_id, regulation_version_id, activity_id, source, suggested_from_quote_id,
      confirmed, confirmed_by, confirmed_at, column_order,
      suggested_regulation_name, suggested_article, suggested_activity,
      suggested_discharge_type, decision_reason, created_by, updated_by
    )
    values (
      target_sample_id, selected_version.id, selected_activity.id,
      case when is_quote_match then 'QUOTE' else 'MANUAL' end,
      case when jsonb_array_length(quote_regulations) > 0 then sample_record.quote_id else null end,
      true, auth.uid(), now(), assigned_order,
      matched_suggestion ->> 'regulation_name',
      matched_suggestion ->> 'article',
      matched_suggestion ->> 'activity',
      matched_suggestion ->> 'discharge_type',
      reason_text, auth.uid(), auth.uid()
    )
    returning * into new_sample_regulation;
    perform public.log_audit(
      'SAMPLE_REGULATION_CONFIRMED',
      'SAMPLE_REGULATION',
      new_sample_regulation.id,
      null,
      to_jsonb(new_sample_regulation),
      reason_text
    );
  end loop;

  if has_difference then
    insert into public.reconciliation_issues (
      sample_id, issue_type, field_name, entity_type, entity_id,
      source_a, value_a, source_b, value_b, status, created_by, updated_by
    )
    values (
      target_sample_id, 'REGULATION_MISMATCH', 'regulation', 'SAMPLE',
      target_sample_id, 'Cotización', suggested_summary::text,
      'Normativa seleccionada', selected_summary::text, 'OPEN', auth.uid(), auth.uid()
    )
    returning id into issue_id;

    insert into public.reconciliation_decisions (
      issue_id, selected_source, selected_value, decision, reason, decided_by
    )
    values (
      issue_id, 'Normativa seleccionada', selected_summary::text,
      'MANUAL', reason_text, auth.uid()
    );

    update public.reconciliation_issues
       set status = 'RESOLVED', updated_by = auth.uid()
     where id = issue_id;

    perform public.log_audit(
      'QUOTE_REGULATION_DIFFERENCE_DECIDED',
      'RECONCILIATION_ISSUE',
      issue_id,
      jsonb_build_object('quote_regulations', suggested_summary),
      jsonb_build_object('selected_regulations', selected_summary),
      reason_text
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'confirmed_count', jsonb_array_length(selections),
    'quote_difference', has_difference
  );
end;
$$;

revoke insert, update, delete on public.regulations, public.regulation_versions,
  public.regulation_activities, public.regulation_limits,
  public.sample_regulations from authenticated;
grant select on public.regulations, public.regulation_versions,
  public.regulation_activities, public.regulation_limits,
  public.sample_regulations to authenticated;

revoke all on function public.import_regulation_csv(text, date, date, jsonb)
  from public, anon, authenticated;
revoke all on function public.activate_regulation_version(uuid)
  from public, anon, authenticated;
revoke all on function public.confirm_sample_regulations(uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.import_regulation_csv(text, date, date, jsonb)
  to authenticated;
grant execute on function public.activate_regulation_version(uuid)
  to authenticated;
grant execute on function public.confirm_sample_regulations(uuid, jsonb, text)
  to authenticated;
