-- Corrige errores que detecta `supabase db lint` (plpgsql_check) en el CI.
--
-- 1. detect_reconciliation_issues llamaba a digest() sin esquema. pgcrypto vive
--    en `extensions`, que no está en el search_path de la función, así que
--    fallaba al registrar cualquier diferencia de conciliación.
-- 2. resolve_reconciliation_issue usaba `mapped_test_id` sin calificar en un
--    UPDATE de import_rows: era ambiguo entre el parámetro y la columna y
--    fallaba al resolver diferencias de mapeo de ensayo.
-- 3. run_validations recorría hallazgos con un `record` desde SQL dinámico;
--    se usan variables tipadas para que el linter pueda verificarlo. Mismo
--    comportamiento.
--
-- CREATE OR REPLACE conserva los permisos (GRANT/REVOKE) ya otorgados.

create or replace function public.detect_reconciliation_issues(target_sample_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  sample_record public.samples%rowtype;
  issue_count integer := 0;
  issue_row record;
  fingerprint_value text;
begin
  if auth.uid() is null or (
    not public.has_role('ANALISTA') and not public.has_role('ADMIN')
  ) then
    raise exception using errcode = '42501', message = 'Se requiere el rol ANALISTA o ADMIN activo.';
  end if;
  select * into sample_record
    from public.samples
   where id = target_sample_id
   for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró la muestra.';
  end if;

  for issue_row in
    select 'DATE_MISMATCH'::text as issue_type, 'sampling_date'::text as field_name,
           'Recepción'::text as source_a, sample_record.sampled_at::text as value_a,
           'Fuente externa'::text as source_b, import_record.raw_payload ->> 'sampling_date' as value_b,
           null::text as source_c, null::text as value_c, 'RESULT_IMPORT'::text as entity_type,
           import_record.id as entity_id, null::uuid as related_entity_id,
           import_record.storage_path, null::integer as source_page
      from public.result_imports import_record
     where import_record.sample_id = target_sample_id
       and public.try_parse_reconciliation_date(
             import_record.raw_payload ->> 'sampling_date'
           ) is not null
       and sample_record.sampled_at::date is distinct from
           public.try_parse_reconciliation_date(
             import_record.raw_payload ->> 'sampling_date'
           )
    union all
    select 'DATE_MISMATCH', 'received_at', 'Recepción', sample_record.received_at::text,
           'Fuente externa', import_record.raw_payload ->> 'received_at',
           null, null, 'RESULT_IMPORT', import_record.id, null,
           import_record.storage_path, null
      from public.result_imports import_record
     where import_record.sample_id = target_sample_id
       and public.try_parse_reconciliation_date(
             import_record.raw_payload ->> 'received_at'
           ) is not null
       and sample_record.received_at::date is distinct from
           public.try_parse_reconciliation_date(
             import_record.raw_payload ->> 'received_at'
           )
    union all
    select 'MATRIX_MISMATCH', 'matrix', 'Recepción', matrix.code,
           'Fuente externa', import_record.raw_payload ->> 'matrix',
           'Catálogo', matrix.name, 'RESULT_IMPORT', import_record.id, null,
           import_record.storage_path, null
      from public.result_imports import_record
      left join public.matrices matrix on matrix.id = sample_record.matrix_id
     where import_record.sample_id = target_sample_id
       and nullif(import_record.raw_payload ->> 'matrix', '') is not null
       and lower(import_record.raw_payload ->> 'matrix') is distinct from lower(matrix.code)
       and lower(import_record.raw_payload ->> 'matrix') is distinct from lower(matrix.name)
    union all
    select 'UNREQUESTED_PARAMETER', 'external_parameter', 'Ensayos solicitados',
           coalesce(test.code, 'Sin mapeo'), 'Fuente externa', import_row.external_parameter,
           null, null, 'IMPORT_ROW', import_row.id, null,
           import_record.storage_path, null
      from public.import_rows import_row
      join public.result_imports import_record on import_record.id = import_row.result_import_id
      left join public.tests test on test.id = import_row.mapped_test_id
     where import_record.sample_id = target_sample_id
       and import_row.mapped_test_id is not null
       and not exists (
         select 1 from public.sample_tests requested
          where requested.sample_id = target_sample_id
            and requested.test_id = import_row.mapped_test_id
            and (
              requested.execution_type <> 'SUBCONTRACTED'
              or requested.assigned_laboratory_id = import_record.laboratory_id
            )
       )
    union all
    select 'MISSING_RESULT', 'result', 'Ensayos solicitados', test.code,
           'Resultados registrados', null, null, null, 'SAMPLE_TEST',
           requested.id, null, null, null
      from public.sample_tests requested
      join public.tests test on test.id = requested.test_id
     where requested.sample_id = target_sample_id
       and not exists (
         select 1 from public.results result_record
          where result_record.sample_id = requested.sample_id
            and result_record.test_id = requested.test_id
            and result_record.status <> 'REJECTED'
            and (
              requested.execution_type <> 'SUBCONTRACTED'
              or result_record.laboratory_id = requested.assigned_laboratory_id
            )
       )
    union all
    select mismatch.issue_type, mismatch.field_name, 'Catálogo', mismatch.catalog_value,
           'Fuente externa', mismatch.external_value, null, null, 'RESULT',
           result_record.id, null, import_record.storage_path, result_record.source_page
      from public.results result_record
      join public.tests test on test.id = result_record.test_id
      left join public.methods method on method.id = test.method_id
      left join public.result_imports import_record on import_record.id = result_record.source_import_id
      cross join lateral (values
        ('LCM_MISMATCH'::text, 'lcm'::text, test.lcm::text, result_record.lcm::text,
          test.lcm is distinct from result_record.lcm),
        ('METHOD_MISMATCH', 'method', method.name, result_record.method_text,
          method.name is distinct from result_record.method_text),
        ('TECHNIQUE_MISMATCH', 'technique', test.technique, result_record.technique_text,
          test.technique is distinct from result_record.technique_text),
        ('UNIT_MISMATCH', 'unit', test.default_unit, result_record.unit,
          test.default_unit is distinct from result_record.unit)
      ) as mismatch(issue_type, field_name, catalog_value, external_value, differs)
     where result_record.sample_id = target_sample_id and mismatch.differs
    union all
    select 'DUPLICATE_RESULT', 'result', 'Resultado', first_result.original_text,
           'Resultado duplicado', duplicate_result.original_text, null, null, 'RESULT',
           first_result.id, duplicate_result.id, import_record.storage_path,
           duplicate_result.source_page
      from public.results first_result
      join public.results duplicate_result
        on duplicate_result.sample_id = first_result.sample_id
       and duplicate_result.test_id = first_result.test_id
       and duplicate_result.laboratory_id = first_result.laboratory_id
       and first_result.status <> 'REJECTED'
       and duplicate_result.status <> 'REJECTED'
       and duplicate_result.id > first_result.id
      left join public.result_imports import_record on import_record.id = duplicate_result.source_import_id
     where first_result.sample_id = target_sample_id
    union all
    select 'LAB_DEVIATION', 'deviation', 'Desviación', null,
           'Fuente externa', import_record.raw_payload ->> 'deviation',
           null, null, 'RESULT_IMPORT', import_record.id, null,
           import_record.storage_path, null
      from public.result_imports import_record
     where import_record.sample_id = target_sample_id
       and nullif(btrim(import_record.raw_payload ->> 'deviation'), '') is not null
    union all
    select 'LEGACY_CODE_NO_MAPPING', 'legacy_code', 'Código externo', null,
           'Fuente externa', import_row.external_parameter,
           'Código SA', null, 'IMPORT_ROW', import_row.id, null,
           import_record.storage_path, null
      from public.import_rows import_row
      join public.result_imports import_record on import_record.id = import_row.result_import_id
     where import_record.sample_id = target_sample_id
       and import_row.mapped_test_id is null
       and import_row.external_parameter ~* '^(AGQ|CHEM|SGI)([[:space:]_-]|$)'
    union all
    select 'INCOMPLETE_TEST_FIELDS', 'test_fields', 'Catálogo', test.code,
           'Campos faltantes', array_to_string(issuable.missing_fields, ', '),
           null, null, 'TEST', test.id, null, null, null
      from public.sample_tests requested
      join public.tests test on test.id = requested.test_id
      join public.v_tests_issuable issuable on issuable.id = test.id
     where requested.sample_id = target_sample_id and not issuable.issuable
    union all
    select 'EXTERNAL_REPORT_PENDING', 'external_shipment', 'Envío externo',
           shipment.external_code, 'Estado', shipment.status,
           'Laboratorio', laboratory.name, 'EXTERNAL_SHIPMENT', shipment.id, null, null, null
      from public.external_shipments shipment
      join public.laboratories laboratory on laboratory.id = shipment.laboratory_id
     where shipment.sample_id = target_sample_id
       and shipment.status not in ('REPORT_RECEIVED', 'CANCELLED')
  loop
    fingerprint_value := encode(extensions.digest(concat_ws(E'\x1f',
      target_sample_id::text, issue_row.issue_type, coalesce(issue_row.entity_type, ''),
      coalesce(issue_row.entity_id::text, ''), coalesce(issue_row.related_entity_id::text, ''),
      coalesce(issue_row.field_name, ''), coalesce(issue_row.value_a, ''),
      coalesce(issue_row.value_b, '')), 'sha256'), 'hex');

    insert into public.reconciliation_issues (
      sample_id, issue_type, field_name, source_a, value_a, source_b, value_b,
      source_c, value_c, entity_type, entity_id, related_entity_id,
      storage_path, source_page, fingerprint, created_by, updated_by
    )
    values (
      target_sample_id, issue_row.issue_type, issue_row.field_name,
      issue_row.source_a, issue_row.value_a, issue_row.source_b, issue_row.value_b,
      issue_row.source_c, issue_row.value_c, issue_row.entity_type,
      issue_row.entity_id, issue_row.related_entity_id, issue_row.storage_path,
      issue_row.source_page, fingerprint_value, auth.uid(), auth.uid()
    )
    on conflict (fingerprint) where fingerprint is not null and status = 'OPEN' do nothing;
    if found then
      issue_count := issue_count + 1;
    end if;
  end loop;

  return issue_count;
end;
$$;

create or replace function public.resolve_reconciliation_issue(
  target_issue_id uuid,
  selected_decision text,
  selected_source text,
  selected_value text,
  decision_reason text,
  mapped_test_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  issue_record public.reconciliation_issues%rowtype;
  selected_result public.results%rowtype;
  selected_import_row public.import_rows%rowtype;
  selected_sample_test public.sample_tests%rowtype;
  selected_sample public.samples%rowtype;
  old_data jsonb;
  new_data jsonb;
  correction_data jsonb;
  expected_value text;
  selected_source_valid boolean := false;
  role_is_jtc boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Se requiere una sesión activa.';
  end if;
  role_is_jtc := public.has_role('JEFE_TECNICA_CALIDAD');
  if selected_decision not in ('ACCEPT_A', 'ACCEPT_B', 'MANUAL', 'REQUEST_REVIEW')
    or nullif(btrim(decision_reason), '') is null then
    raise exception using errcode = '22023', message = 'Decisión válida y motivo obligatorio.';
  end if;
  if selected_decision = 'REQUEST_REVIEW' then
    if not (role_is_jtc or public.has_role('ANALISTA') or public.has_role('ADMIN')) then
      raise exception using errcode = '42501', message = 'No tiene permiso para solicitar revisión.';
    end if;
  elsif not public.has_any_role(array['ANALISTA', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Se requiere el rol ANALISTA o ADMIN para resolver.';
  end if;

  select * into issue_record
    from public.reconciliation_issues
   where id = target_issue_id
   for update;
  if not found or issue_record.status <> 'OPEN' then
    raise exception using errcode = 'P0002', message = 'La inconsistencia no existe o ya fue resuelta.';
  end if;

  if selected_decision = 'ACCEPT_A' then
    expected_value := issue_record.value_a;
    selected_source_valid := selected_source = issue_record.source_a;
  elsif selected_decision = 'ACCEPT_B' then
    expected_value := issue_record.value_b;
    selected_source_valid := selected_source = issue_record.source_b;
  elsif selected_decision = 'MANUAL' then
    expected_value := selected_value;
    selected_source_valid := selected_source = 'Manual';
  else
    expected_value := selected_value;
    selected_source_valid := true;
  end if;

  if selected_decision <> 'REQUEST_REVIEW' and
     (not selected_source_valid or expected_value is distinct from selected_value) then
    raise exception using errcode = '22023', message = 'La fuente o el valor seleccionado no coincide con la inconsistencia.';
  end if;
  if issue_record.issue_type = 'MISSING_RESULT'
     and selected_decision in ('ACCEPT_A', 'ACCEPT_B', 'MANUAL') then
    if not exists (
      select 1 from public.sample_tests requested
      join public.results result_record
        on result_record.sample_id = requested.sample_id
       and result_record.test_id = requested.test_id
       and result_record.status <> 'REJECTED'
       and (
         requested.execution_type <> 'SUBCONTRACTED'
         or result_record.laboratory_id = requested.assigned_laboratory_id
       )
      where requested.id = issue_record.entity_id
        and requested.sample_id = issue_record.sample_id
    ) then
      raise exception using errcode = '22023', message = 'Cargue y confirme el resultado antes de resolver esta inconsistencia.';
    end if;
  elsif issue_record.issue_type = 'EXTERNAL_REPORT_PENDING'
     and selected_decision in ('ACCEPT_A', 'ACCEPT_B', 'MANUAL') then
    if not exists (
      select 1 from public.external_shipments shipment
       where shipment.id = issue_record.entity_id
         and shipment.sample_id = issue_record.sample_id
         and shipment.status in ('REPORT_RECEIVED', 'CANCELLED')
    ) then
      raise exception using errcode = '22023', message = 'Reciba o cancele el envío externo antes de resolver esta inconsistencia.';
    end if;
  elsif issue_record.issue_type = 'UNREQUESTED_PARAMETER'
     and selected_decision = 'ACCEPT_A' then
    if mapped_test_id is null
      or not exists (
        select 1 from public.tests test
         join public.v_tests_issuable issuable
           on issuable.id = test.id and issuable.issuable
         where test.id = mapped_test_id and test.active and test.code ~ '^SA'
      ) then
      raise exception using errcode = '22023', message = 'Seleccione un ensayo SA vigente para agregarlo al alcance.';
    end if;
    select import_row.* into selected_import_row
      from public.import_rows import_row
      join public.result_imports import_record on import_record.id = import_row.result_import_id
     where import_row.id = issue_record.entity_id
       and issue_record.sample_id = import_record.sample_id
       for update of import_row;
    if not found then
      raise exception using errcode = 'P0002', message = 'No fue posible vincular el parámetro con su laboratorio externo.';
    end if;
    old_data := to_jsonb(selected_import_row);
    update public.import_rows
       set mapped_test_id = resolve_reconciliation_issue.mapped_test_id,
           mapping_status = 'SUGGESTED',
           updated_by = auth.uid()
     where id = issue_record.entity_id;
    select * into selected_import_row from public.import_rows
     where id = issue_record.entity_id;
    new_data := to_jsonb(selected_import_row);
    perform public.log_audit(
      'IMPORT_ROW_MAPPED_BY_RECONCILIATION', 'IMPORT_ROW',
      selected_import_row.id, old_data, new_data, btrim(decision_reason)
    );
    insert into public.sample_tests (
      sample_id, test_id, execution_type, assigned_laboratory_id, created_by, updated_by
    )
    select issue_record.sample_id, resolve_reconciliation_issue.mapped_test_id,
           'SUBCONTRACTED', import_record.laboratory_id, auth.uid(), auth.uid()
      from public.import_rows import_row
      join public.result_imports import_record on import_record.id = import_row.result_import_id
     where import_row.id = issue_record.entity_id
       and not exists (
         select 1 from public.sample_tests requested
          where requested.sample_id = issue_record.sample_id
            and requested.test_id = resolve_reconciliation_issue.mapped_test_id
            and requested.assigned_laboratory_id = import_record.laboratory_id
       )
    returning * into selected_sample_test;
    if found then
      perform public.log_audit(
        'SAMPLE_TEST_ADDED_BY_RECONCILIATION', 'SAMPLE_TEST',
        selected_sample_test.id, null, to_jsonb(selected_sample_test),
        btrim(decision_reason)
      );
    end if;
  elsif issue_record.issue_type = 'UNREQUESTED_PARAMETER'
     and selected_decision = 'ACCEPT_B' then
    select * into selected_import_row from public.import_rows
     where id = issue_record.entity_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'No se encontró la fila para rechazar el parámetro.';
    end if;
    old_data := to_jsonb(selected_import_row);
    update public.import_rows
       set mapped_test_id = null,
           mapping_status = 'UNMAPPED',
           validation_messages = coalesce(validation_messages, '[]'::jsonb)
             || jsonb_build_array('Parámetro rechazado durante conciliación.'),
           updated_by = auth.uid()
     where id = issue_record.entity_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'No se encontró la fila para rechazar el parámetro.';
    end if;
    select * into selected_import_row from public.import_rows
     where id = issue_record.entity_id;
    perform public.log_audit(
      'IMPORT_ROW_UNMAPPED_BY_RECONCILIATION', 'IMPORT_ROW',
      selected_import_row.id, old_data, to_jsonb(selected_import_row),
      btrim(decision_reason)
    );
  elsif issue_record.issue_type = 'LEGACY_CODE_NO_MAPPING'
     and selected_decision in ('ACCEPT_A', 'ACCEPT_B', 'MANUAL') then
    if mapped_test_id is null
      or not exists (
        select 1 from public.tests test
         join public.v_tests_issuable issuable on issuable.id = test.id and issuable.issuable
         where test.id = mapped_test_id and test.active and test.code ~ '^SA'
      ) then
      raise exception using errcode = '22023', message = 'El código heredado requiere un ensayo SA vigente.';
    end if;
    select * into selected_import_row from public.import_rows
     where id = issue_record.entity_id for update;
    if not found or selected_import_row.mapped_test_id is not null then
      raise exception using errcode = 'P0002', message = 'No se encontró la fila heredada sin mapear.';
    end if;
    old_data := to_jsonb(selected_import_row);
    update public.import_rows
       set mapped_test_id = resolve_reconciliation_issue.mapped_test_id,
           mapping_status = 'SUGGESTED',
           updated_by = auth.uid()
     where id = issue_record.entity_id and import_rows.mapped_test_id is null;
    if not found then
      raise exception using errcode = 'P0002', message = 'No se encontró la fila heredada sin mapear.';
    end if;
    select * into selected_import_row from public.import_rows
     where id = issue_record.entity_id;
    perform public.log_audit(
      'LEGACY_IMPORT_ROW_MAPPED', 'IMPORT_ROW',
      selected_import_row.id, old_data, to_jsonb(selected_import_row),
      btrim(decision_reason)
    );
  elsif issue_record.issue_type = 'INCOMPLETE_TEST_FIELDS'
     and selected_decision in ('ACCEPT_A', 'ACCEPT_B', 'MANUAL') then
    if not exists (
      select 1 from public.v_tests_issuable
       where id = issue_record.entity_id and issuable
    ) then
      raise exception using errcode = '22023', message = 'El ensayo sigue incompleto o no está vigente; complete su ficha antes de resolver la inconsistencia.';
    end if;
  elsif issue_record.issue_type = 'DUPLICATE_RESULT'
     and selected_decision in ('ACCEPT_A', 'ACCEPT_B') then
    if issue_record.related_entity_id is null then
      raise exception using errcode = '22023', message = 'No se identificó el resultado duplicado para descartarlo.';
    end if;
    select * into selected_result from public.results
     where id = case when selected_decision = 'ACCEPT_A'
                     then issue_record.related_entity_id else issue_record.entity_id end
       and sample_id = issue_record.sample_id
     for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'No se encontró el resultado duplicado.';
    end if;
    old_data := to_jsonb(selected_result);
    update public.results
       set status = 'REJECTED', updated_by = auth.uid()
     where id = selected_result.id;
    select * into selected_result from public.results where id = selected_result.id;
    perform public.log_audit(
      'RESULT_REJECTED_DUPLICATE', 'RESULT',
      selected_result.id, old_data, to_jsonb(selected_result), btrim(decision_reason)
    );
  elsif issue_record.issue_type in (
    'DATE_MISMATCH', 'MATRIX_MISMATCH', 'LCM_MISMATCH',
    'METHOD_MISMATCH', 'UNIT_MISMATCH', 'TECHNIQUE_MISMATCH'
  ) and selected_decision in ('ACCEPT_A', 'ACCEPT_B', 'MANUAL') then
    if issue_record.issue_type = 'DATE_MISMATCH'
       and issue_record.field_name in ('sampling_date', 'sampled_at', 'received_at') then
      select * into selected_sample from public.samples
       where id = issue_record.sample_id for update;
      if not found then
        raise exception using errcode = 'P0002', message = 'No se encontró la muestra relacionada.';
      end if;
      old_data := to_jsonb(selected_sample);
      if issue_record.field_name in ('sampling_date', 'sampled_at') then
        update public.samples set sampled_at = nullif(selected_value, '')::timestamptz,
          updated_by = auth.uid() where id = issue_record.sample_id;
      else
        update public.samples set received_at = selected_value::timestamptz,
          updated_by = auth.uid() where id = issue_record.sample_id;
      end if;
      select * into selected_sample from public.samples where id = issue_record.sample_id;
      perform public.log_audit(
        'SAMPLE_DATE_CORRECTED_BY_RECONCILIATION', 'SAMPLE',
        selected_sample.id, old_data, to_jsonb(selected_sample), btrim(decision_reason)
      );
    elsif issue_record.issue_type = 'MATRIX_MISMATCH' and issue_record.field_name = 'matrix' then
      select * into selected_sample from public.samples
       where id = issue_record.sample_id for update;
      if not found then
        raise exception using errcode = 'P0002', message = 'No se encontró la muestra relacionada.';
      end if;
      old_data := to_jsonb(selected_sample);
      update public.samples sample
         set matrix_id = matrix.id, updated_by = auth.uid()
        from public.matrices matrix
       where sample.id = issue_record.sample_id
         and (matrix.code = selected_value or matrix.name = selected_value)
         and matrix.active;
      if not found then
        raise exception using errcode = '22023', message = 'Seleccione una matriz activa reconocida en el catálogo.';
      end if;
      select * into selected_sample from public.samples where id = issue_record.sample_id;
      perform public.log_audit(
        'SAMPLE_MATRIX_CORRECTED_BY_RECONCILIATION', 'SAMPLE',
        selected_sample.id, old_data, to_jsonb(selected_sample), btrim(decision_reason)
      );
    elsif issue_record.entity_type = 'RESULT' then
      select * into selected_result from public.results
       where id = issue_record.entity_id and sample_id = issue_record.sample_id
       for update;
      if not found then
        raise exception using errcode = 'P0002', message = 'No se encontró el resultado relacionado.';
      end if;
      old_data := to_jsonb(selected_result);
      if issue_record.field_name = 'lcm' then
        correction_data := jsonb_build_object('lcm', selected_value::numeric);
        update public.results set lcm = selected_value::numeric, status = 'CORRECTED',
          updated_by = auth.uid() where id = selected_result.id;
      elsif issue_record.field_name = 'method' then
        correction_data := jsonb_build_object('method_text', selected_value);
        update public.results set method_text = selected_value, status = 'CORRECTED',
          updated_by = auth.uid() where id = selected_result.id;
      elsif issue_record.field_name = 'unit' then
        correction_data := jsonb_build_object('unit', selected_value);
        update public.results set unit = selected_value, status = 'CORRECTED',
          updated_by = auth.uid() where id = selected_result.id;
      elsif issue_record.field_name = 'technique' then
        correction_data := jsonb_build_object('technique_text', selected_value);
        update public.results set technique_text = selected_value, status = 'CORRECTED',
          updated_by = auth.uid() where id = selected_result.id;
      else
        raise exception using errcode = '22023', message = 'Campo de conciliación no modificable.';
      end if;
      select * into selected_result from public.results where id = selected_result.id;
      new_data := to_jsonb(selected_result);
      insert into public.result_corrections (
        result_id, old_data, new_data, reason, corrected_by
      )
      values (selected_result.id, old_data, correction_data, btrim(decision_reason), auth.uid());
      perform public.log_audit(
        'RESULT_CORRECTED_BY_RECONCILIATION', 'RESULT', selected_result.id,
        old_data, new_data, btrim(decision_reason)
      );
    else
      raise exception using errcode = '22023', message = 'Esta inconsistencia no admite una modificación automática del dato relacionado.';
    end if;
  elsif selected_decision = 'MANUAL' and nullif(btrim(selected_value), '') is null then
    raise exception using errcode = '22023', message = 'Indique el valor manual antes de resolver.';
  end if;

  insert into public.reconciliation_decisions (
    issue_id, selected_source, selected_value, decision, reason, decided_by
  )
  values (
    issue_record.id, selected_source, selected_value, selected_decision,
    btrim(decision_reason), auth.uid()
  );

  if selected_decision <> 'REQUEST_REVIEW' then
    update public.reconciliation_issues
       set status = 'RESOLVED', updated_by = auth.uid()
     where id = issue_record.id;
  end if;

  perform public.log_audit(
    case when selected_decision = 'REQUEST_REVIEW'
         then 'RECONCILIATION_REVIEW_REQUESTED'
         else 'RECONCILIATION_ISSUE_RESOLVED' end,
    'RECONCILIATION_ISSUE', issue_record.id,
    to_jsonb(issue_record),
    jsonb_build_object(
      'decision', selected_decision,
      'selected_source', selected_source,
      'selected_value', selected_value,
      'status', case when selected_decision = 'REQUEST_REVIEW' then 'OPEN' else 'RESOLVED' end
    ),
    btrim(decision_reason)
  );

  return jsonb_build_object(
    'ok', true,
    'status', case when selected_decision = 'REQUEST_REVIEW' then 'OPEN' else 'RESOLVED' end
  );
end;
$$;

create or replace function public.run_validations(
  p_entity_type text,
  p_entity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  run_id uuid;
  rule_record public.validation_rules%rowtype;
  finding_field text;
  finding_message text;
begin
  if auth.uid() is null or not public.has_any_role(array['ANALISTA', 'JEFE_TECNICA_CALIDAD', 'ADMIN']) then
    raise exception using errcode = '42501', message = 'Rol insuficiente para ejecutar validaciones.';
  end if;
  if p_entity_type not in ('SAMPLE', 'REPORT') or p_entity_id is null then
    raise exception using errcode = '22023', message = 'Tipo o identificador de entidad no válido.';
  end if;
  if p_entity_type = 'SAMPLE' and not exists (select 1 from public.samples where id = p_entity_id) then
    raise exception using errcode = 'P0002', message = 'No se encontró la muestra que se va a validar.';
  end if;
  if p_entity_type = 'REPORT' and not exists (select 1 from public.reports where id = p_entity_id) then
    raise exception using errcode = 'P0002', message = 'No se encontró el reporte que se va a validar.';
  end if;

  insert into public.validation_runs (entity_type, entity_id, status, executed_by)
  values (p_entity_type, p_entity_id, 'RUNNING', auth.uid())
  returning id into run_id;

  for rule_record in
    select * from public.validation_rules
     where entity_type = p_entity_type and active and validator_function is not null
     order by code
  loop
    for finding_field, finding_message in execute format(
      'select field_name, message from %s($1, $2)',
      rule_record.validator_function
    ) using rule_record.code, p_entity_id
    loop
      insert into public.validation_issues (
        validation_run_id, rule_code, severity, field_name, message, blocking
      )
      values (
        run_id, rule_record.code, rule_record.severity,
        finding_field, finding_message, rule_record.blocking
      );
    end loop;
  end loop;

  update public.validation_issues previous_issue
     set resolved = true,
         resolution = 'Cerrado automáticamente por una reejecución; consultar los hallazgos del nuevo run.',
         resolved_by = auth.uid(),
         resolved_at = now()
    from public.validation_runs previous_run
   where previous_run.id = previous_issue.validation_run_id
     and previous_run.entity_type = p_entity_type
     and previous_run.entity_id = p_entity_id
     and previous_issue.blocking
     and not previous_issue.resolved
     and previous_run.id <> run_id;

  update public.validation_runs set status = 'COMPLETED' where id = run_id;
  perform public.log_audit(
    'VALIDATION_RUN_COMPLETED', p_entity_type, p_entity_id, null,
    jsonb_build_object('run_id', run_id),
    'Ejecución del motor de validaciones'
  );
  return run_id;
exception when others then
  if run_id is not null then
    update public.validation_runs set status = 'FAILED' where id = run_id;
  end if;
  raise;
end;
$$;
