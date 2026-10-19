-- p10: registered database checks, repeatable runs and audited warning decisions.

alter table public.validation_rules
  add column if not exists validator_function regprocedure;

insert into public.validation_rules (code, description, severity, blocking, entity_type)
values
  ('VAL_SAMPLE_IDENTITY', 'Muestra o cliente sin identificar', 'ERROR', true, 'SAMPLE'),
  ('VAL_TEST_UNCONFIRMED', 'Ensayo sin correspondencia confirmada', 'ERROR', true, 'SAMPLE'),
  ('VAL_RESULT_UNIT', 'Resultado sin unidad requerida', 'ERROR', true, 'SAMPLE'),
  ('VAL_CATALOG_INCOMPLETE', 'Ensayo con catálogo incompleto', 'ERROR', true, 'SAMPLE'),
  ('VAL_UNIT_INCOMPATIBLE', 'Unidad incompatible sin conversión aprobada', 'ERROR', true, 'SAMPLE'),
  ('VAL_RESULT_SOURCE', 'Resultado sin fuente o trazabilidad', 'ERROR', true, 'SAMPLE'),
  ('VAL_SUBCONTRACT_SCOPE', 'Ensayo subcontratado sin laboratorio o fuera de alcance', 'ERROR', true, 'SAMPLE'),
  ('VAL_RSA_DUPLICATE_CODE', 'Código de reporte duplicado', 'ERROR', true, 'REPORT')
on conflict (code) do nothing;

create or replace function public.evaluate_sample_validation_rule(
  p_rule_code text,
  p_sample_id uuid
)
returns table(field_name text, message text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if p_rule_code = 'VAL_SAMPLE_IDENTITY' then
    return query
      select 'client_id', 'La muestra no tiene un cliente activo e identificable.'
       where exists (
         select 1 from public.samples sample
         left join public.clients client on client.id = sample.client_id
          where sample.id = p_sample_id
            and (client.id is null or not client.active
              or nullif(btrim(client.business_name), '') is null)
       );
  elsif p_rule_code = 'VAL_TEST_UNCONFIRMED' then
    return query
      select 'mapping_status', 'Hay parámetros importados sin correspondencia SA confirmada.'
       where exists (
         select 1
           from public.result_imports import_record
           join public.import_rows import_row on import_row.result_import_id = import_record.id
          where import_record.sample_id = p_sample_id
            and (import_row.mapping_status <> 'CONFIRMED'
              or not import_row.confirmed or import_row.mapped_test_id is null)
       );
  elsif p_rule_code = 'VAL_RESULT_UNIT' then
    return query
      select result.id::text, 'El resultado no contiene la unidad requerida por el ensayo.'
        from public.results result
        join public.tests test on test.id = result.test_id
       where result.sample_id = p_sample_id
         and nullif(btrim(test.default_unit), '') is not null
         and upper(btrim(test.default_unit)) <> 'FALTA INFO'
         and nullif(btrim(result.unit), '') is null;
  elsif p_rule_code = 'VAL_CATALOG_INCOMPLETE' then
    return query
      select sample_test.id::text, 'El ensayo solicitado tiene datos de catálogo incompletos o no emitibles.'
        from public.sample_tests sample_test
        left join public.v_tests_issuable issuable on issuable.id = sample_test.test_id
       where sample_test.sample_id = p_sample_id
         and (issuable.id is null or not issuable.issuable);
  elsif p_rule_code = 'VAL_UNIT_INCOMPATIBLE' then
    return query
      select result.id::text, 'La unidad del resultado difiere de la unidad del ensayo; no hay conversión aprobada registrada.'
        from public.results result
        join public.tests test on test.id = result.test_id
       where result.sample_id = p_sample_id
         and nullif(btrim(test.default_unit), '') is not null
         and nullif(btrim(result.unit), '') is not null
         and upper(btrim(test.default_unit)) <> 'FALTA INFO'
         and btrim(result.unit) <> btrim(test.default_unit);
  elsif p_rule_code = 'VAL_REG_UNCONFIRMED' then
    return query
      select 'sample_regulations', 'La normativa requerida por la cotización no está confirmada para la muestra.'
       where exists (
         select 1
           from public.samples sample
           join public.quote_regulations quote_regulation
             on quote_regulation.quote_id = sample.quote_id
            and quote_regulation.active and quote_regulation.requires_confirmation
          where sample.id = p_sample_id
            and not exists (
              select 1 from public.sample_regulations sample_regulation
               where sample_regulation.sample_id = sample.id
                 and sample_regulation.confirmed
                 and sample_regulation.confirmed_by is not null
                 and sample_regulation.confirmed_at is not null
            )
       )
      union all
      select 'sample_regulations', 'La muestra tiene una selección normativa sin confirmación humana.'
       where exists (
         select 1 from public.sample_regulations sample_regulation
          where sample_regulation.sample_id = p_sample_id
            and (not sample_regulation.confirmed
              or sample_regulation.confirmed_by is null
              or sample_regulation.confirmed_at is null)
       );
  elsif p_rule_code = 'VAL_RESULT_SOURCE' then
    return query
      select result.id::text, 'El resultado importado no conserva un origen de importación válido para la misma muestra.'
        from public.results result
        left join public.result_imports import_record
          on import_record.id = result.source_import_id
         and import_record.sample_id = result.sample_id
       where result.sample_id = p_sample_id
         and result.entry_mechanism = 'IMPORTED'
         and (result.source_import_id is null or import_record.id is null);
  elsif p_rule_code = 'VAL_EXT_PENDING' then
    return query
      select 'external_reports', 'La muestra tiene reportes de laboratorio externo pendientes de recepción.'
       where public.sample_has_pending_external_reports(p_sample_id);
  elsif p_rule_code = 'VAL_LEGACY_UNMAPPED' then
    return query
      select import_row.id::text, 'Hay un código o parámetro heredado sin correspondencia SA confirmada.'
        from public.result_imports import_record
        join public.import_rows import_row on import_row.result_import_id = import_record.id
       where import_record.sample_id = p_sample_id
         and (import_row.mapped_test_id is null or not import_row.confirmed
           or import_row.mapping_status <> 'CONFIRMED');
  elsif p_rule_code = 'VAL_SUBCONTRACT_SCOPE' then
    return query
      select sample_test.id::text, 'El ensayo subcontratado no tiene laboratorio asignado o el ensayo no figura en su alcance acreditado vigente.'
        from public.sample_tests sample_test
        left join public.tests test on test.id = sample_test.test_id
       where sample_test.sample_id = p_sample_id
         and sample_test.execution_type = 'SUBCONTRACTED'
         and (
           sample_test.assigned_laboratory_id is null
           or not exists (
             select 1
               from public.laboratory_accredited_tests accredited_test
               join public.laboratory_accreditations accreditation
                 on accreditation.id = accredited_test.accreditation_id
              where accredited_test.test_id = sample_test.test_id
                and accredited_test.active and accreditation.active
                and accreditation.laboratory_id = sample_test.assigned_laboratory_id
                and accreditation.valid_from <= current_date
                and (accreditation.valid_until is null or accreditation.valid_until >= current_date)
           )
         );
  elsif p_rule_code = 'VAL_RECON_OPEN' then
    return query
      select 'reconciliation_issues', 'La muestra tiene inconsistencias de conciliación abiertas.'
       where exists (
         select 1 from public.reconciliation_issues issue
          where issue.sample_id = p_sample_id and issue.status = 'OPEN'
       );
  elsif p_rule_code = 'VAL_NO_RESULTS' then
    return query
      select sample_test.id::text, 'Un ensayo solicitado aún no tiene un resultado registrado.'
        from public.sample_tests sample_test
       where sample_test.sample_id = p_sample_id
         and sample_test.status not in ('CANCELLED', 'NOT_APPLICABLE')
         and not exists (
           select 1 from public.results result
            where result.sample_id = sample_test.sample_id
              and result.test_id = sample_test.test_id
              and result.status <> 'REJECTED'
         );
  elsif p_rule_code = 'VAL_DATE_SUSPICIOUS' then
    return query
      select 'sampled_at', 'La fecha de muestreo está en el futuro o es posterior a la recepción.'
       from public.samples sample
      where sample.id = p_sample_id
        and sample.sampled_at is not null
        and (sample.sampled_at > now() or sample.sampled_at > sample.received_at);
  elsif p_rule_code = 'VAL_REG_DIFF_QUOTE' then
    return query
      select 'regulation', 'La normativa confirmada difiere de la sugerida en la cotización; requiere revisión.'
       where exists (
         select 1 from public.reconciliation_issues issue
          where issue.sample_id = p_sample_id
            and issue.issue_type = 'REGULATION_MISMATCH'
       );
  elsif p_rule_code = 'VAL_MATRIX_MISMATCH' then
    return query
      select 'matrix', 'El tipo de descarga de la actividad normativa no coincide con la matriz registrada.'
        from public.samples sample
        join public.matrices matrix on matrix.id = sample.matrix_id
        join public.sample_regulations sample_regulation
          on sample_regulation.sample_id = sample.id and sample_regulation.confirmed
        join public.regulation_activities activity on activity.id = sample_regulation.activity_id
       where sample.id = p_sample_id
         and activity.discharge_type in ('ARD', 'ARnD')
         and (
           (matrix.code ilike '%ARnD%' or matrix.name ilike '%ARnD%')
             and activity.discharge_type <> 'ARnD'
           or (matrix.code ilike '%ARD%' or matrix.name ilike '%ARD%')
             and matrix.code not ilike '%ARnD%' and matrix.name not ilike '%ARnD%'
             and activity.discharge_type <> 'ARD'
         );
  elsif p_rule_code = 'VAL_LAB_DEVIATION' then
    return query
      select 'deviations', 'La recepción registra una desviación informada que requiere decisión.'
       where exists (
         select 1 from public.sample_receptions reception
          where reception.sample_id = p_sample_id
            and nullif(btrim(reception.deviations), '') is not null
       );
  end if;
end;
$$;

update public.validation_rules
   set validator_function = 'public.evaluate_sample_validation_rule(text,uuid)'::regprocedure
 where entity_type = 'SAMPLE';

-- RSA validation rules remain registered until the report workflow activates
-- their entity-specific evaluators.
insert into public.validation_rules (code, description, severity, blocking, entity_type)
values
  ('VAL_RSA_NO_TEMPLATE', 'Plantilla sin versión aprobada', 'ERROR', true, 'REPORT'),
  ('VAL_RSA_DUPLICATE_CODE', 'Código de reporte duplicado', 'ERROR', true, 'REPORT'),
  ('VAL_RSA_SEGREGATION', 'Segregación preparador/aprobador incumplida', 'ERROR', true, 'REPORT'),
  ('VAL_RSA_NO_SIGNATURE', 'Firma o aprobación inexistente', 'ERROR', true, 'REPORT'),
  ('VAL_RSA_ISO_CONTENT', 'Contenido mínimo ISO/IEC 17025 7.8.2 incompleto', 'ERROR', true, 'REPORT')
on conflict (code) do nothing;

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
  finding record;
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
    for finding in execute format(
      'select field_name, message from %s($1, $2)',
      rule_record.validator_function
    ) using rule_record.code, p_entity_id
    loop
      insert into public.validation_issues (
        validation_run_id, rule_code, severity, field_name, message, blocking
      )
      values (
        run_id, rule_record.code, rule_record.severity,
        finding.field_name, finding.message, rule_record.blocking
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

create or replace function public.resolve_validation_warning(
  p_issue_id uuid,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  issue_record public.validation_issues%rowtype;
begin
  if auth.uid() is null or not public.has_any_role(array['ANALISTA', 'JEFE_TECNICA_CALIDAD', 'ADMIN']) then
    return jsonb_build_object('ok', false, 'error_code', 'INSUFFICIENT_ROLE',
      'message', 'Rol insuficiente para resolver advertencias.');
  end if;
  if nullif(btrim(p_resolution), '') is null then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'message', 'Escriba un comentario para resolver la advertencia.');
  end if;
  select * into issue_record
    from public.validation_issues
   where id = p_issue_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND',
      'message', 'No se encontró el hallazgo.');
  end if;
  if issue_record.blocking or issue_record.severity <> 'WARNING' then
    return jsonb_build_object('ok', false, 'error_code', 'BLOCKING_ISSUE',
      'message', 'Los errores bloqueantes no se pueden resolver con un comentario.');
  end if;
  if issue_record.resolved then
    return jsonb_build_object('ok', false, 'error_code', 'ALREADY_RESOLVED',
      'message', 'Esta advertencia ya fue resuelta.');
  end if;

  update public.validation_issues
     set resolved = true, resolution = btrim(p_resolution),
         resolved_by = auth.uid(), resolved_at = now()
   where id = p_issue_id;
  perform public.log_audit(
    'VALIDATION_WARNING_RESOLVED', 'VALIDATION_ISSUE', p_issue_id,
    to_jsonb(issue_record),
    jsonb_build_object('resolved', true, 'resolution', btrim(p_resolution)),
    btrim(p_resolution)
  );
  return jsonb_build_object('ok', true);
end;
$$;

drop policy if exists "val_runs: write" on public.validation_runs;
drop policy if exists "val_runs: update" on public.validation_runs;
drop policy if exists "val_issues: write" on public.validation_issues;
drop policy if exists "val_issues: update" on public.validation_issues;
drop policy if exists "val_rules: admin" on public.validation_rules;

revoke insert, update, delete on public.validation_runs, public.validation_issues,
  public.validation_rules from authenticated;
grant select on public.validation_runs, public.validation_issues, public.validation_rules
  to authenticated;

revoke all on function public.run_validations(text, uuid) from public, anon, authenticated;
revoke all on function public.resolve_validation_warning(uuid, text) from public, anon, authenticated;
revoke all on function public.evaluate_sample_validation_rule(text, uuid) from public, anon, authenticated;
grant execute on function public.run_validations(text, uuid) to authenticated;
grant execute on function public.resolve_validation_warning(uuid, text) to authenticated;
