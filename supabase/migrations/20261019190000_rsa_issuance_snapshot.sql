-- Revalidate issuance and freeze the complete report content, not only link IDs.
create or replace function public.issue_report(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  report_row public.reports%rowtype;
  format_value text;
  sequence_value bigint;
  sequence_text text;
  report_code text;
  snapshot_value jsonb;
  snapshot_hash text;
  validation_run uuid;
  issued_time timestamptz := now();
begin
  select * into report_row from public.reports where id = p_report_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND');
  end if;
  if report_row.status <> 'APPROVED' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_STATUS',
      'message', 'Solo se puede emitir un reporte aprobado.');
  end if;

  if not public.has_role('JEFE_TECNICA_CALIDAD') then
    perform public.log_audit('ISSUE_REPORT_DENIED', 'REPORT', p_report_id,
      null, jsonb_build_object('reason', 'rol insuficiente'));
    return jsonb_build_object('ok', false, 'error_code', 'INSUFFICIENT_ROLE');
  end if;
  if report_row.prepared_by = auth.uid() then
    perform public.log_audit('ISSUE_REPORT_DENIED', 'REPORT', p_report_id,
      null, jsonb_build_object('reason', 'segregacion'));
    return jsonb_build_object('ok', false, 'error_code', 'SEGREGATION_VIOLATION');
  end if;

  if report_row.client_id is null or report_row.template_id is null
     or not exists (select 1 from public.report_templates template
       where template.id = report_row.template_id and template.active
         and template.status = 'APPROVED' and template.approved_at is not null)
     or not exists (select 1 from public.report_samples item where item.report_id = p_report_id)
     or not exists (select 1 from public.report_results item where item.report_id = p_report_id)
     or not exists (select 1 from public.report_approvals approval
       where approval.report_id = p_report_id and approval.decision = 'APPROVED') then
    return jsonb_build_object('ok', false, 'error_code', 'REQUIRED_CONTENT_MISSING',
      'message', 'Falta cliente, plantilla aprobada, muestras, resultados o aprobación registrada.');
  end if;

  if exists (
    select 1 from public.report_samples item
    join public.samples sample on sample.id = item.sample_id
    where item.report_id = p_report_id
      and (sample.sampled_at is null or sample.received_at is null)
  ) or exists (
    select 1 from public.report_results item
    join public.results result on result.id = item.result_id
    where item.report_id = p_report_id
      and (result.analysis_start is null or result.analysis_end is null
        or result.method_text is null or result.accreditation_type is null)
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'REQUIRED_CONTENT_MISSING',
      'message', 'Faltan fechas, método o identificación de acreditación requeridos para emitir.');
  end if;

  for validation_run in
    select public.run_validations('SAMPLE', item.sample_id)
    from public.report_samples item where item.report_id = p_report_id
  loop
    if exists (select 1 from public.validation_issues issue
      where issue.validation_run_id = validation_run and issue.blocking and not issue.resolved) then
      return jsonb_build_object('ok', false, 'error_code', 'BLOCKING_VALIDATION',
        'message', 'Una muestra tiene hallazgos bloqueantes de validación.');
    end if;
  end loop;

  if exists (
    select 1 from public.report_samples item
    where item.report_id = p_report_id
      and public.sample_has_pending_external_reports(item.sample_id)
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'PENDING_EXTERNAL_REPORTS',
      'message', 'Existen reportes de laboratorio externo pendientes.');
  end if;

  select setting.value #>> '{}' into format_value
  from public.app_settings setting where setting.key = 'document.format.RSA';
  if format_value is null or position('NNNN' in format_value) = 0
     or position('AAAA' in format_value) = 0 then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_CODE_FORMAT',
      'message', 'Configure document.format.RSA con los marcadores NNNN y AAAA.');
  end if;
  sequence_value := public.next_counter('RSA', extract(year from issued_time)::integer);
  sequence_text := lpad(sequence_value::text, greatest(4, length(sequence_value::text)), '0');
  report_code := replace(replace(format_value, 'NNNN', sequence_text),
    'AAAA', extract(year from issued_time)::integer::text);

  select jsonb_build_object(
    'report_id', p_report_id,
    'code', report_code,
    'version', report_row.version,
    'issued_at', issued_time,
    'issued_by', auth.uid(),
    'client', (select to_jsonb(client) from public.clients client where client.id = report_row.client_id),
    'contact', (select to_jsonb(contact) from public.contacts contact where contact.id = report_row.contact_id),
    'prepared_by', (select jsonb_build_object('id', profile.id, 'full_name', profile.full_name)
      from public.profiles profile where profile.id = report_row.prepared_by),
    'approved_by', (select jsonb_build_object('id', profile.id, 'full_name', profile.full_name)
      from public.profiles profile where profile.id = report_row.approved_by),
    'approval', (select jsonb_build_object('approver_id', approval.approver_id,
      'decision', approval.decision, 'signature_reference', approval.signature_reference,
      'created_at', approval.created_at)
      from public.report_approvals approval where approval.report_id = p_report_id
        and approval.decision = 'APPROVED' order by approval.created_at desc limit 1),
    'template', (select jsonb_build_object('id', template.id, 'code', template.code,
      'version', template.version, 'approval_date', template.approval_date,
      'approved_at', template.approved_at, 'configuration', template.configuration)
      from public.report_templates template where template.id = report_row.template_id),
    'samples', (select jsonb_agg(jsonb_build_object(
      'id', sample.id, 'code', sample.code, 'sampling_point', sample.sampling_point,
      'sampled_at', sample.sampled_at, 'received_at', sample.received_at,
      'observations', sample.observations,
      'matrix', (select jsonb_build_object('id', matrix.id, 'code', matrix.code, 'name', matrix.name)
        from public.matrices matrix where matrix.id = sample.matrix_id)
    ) order by sample.code)
      from public.report_samples item join public.samples sample on sample.id = item.sample_id
      where item.report_id = p_report_id),
    'results', (select jsonb_agg(jsonb_build_object(
      'id', result.id, 'sample_id', result.sample_id, 'test_id', result.test_id,
      'operator', result.operator, 'numeric_value', result.numeric_value,
      'original_text', result.original_text, 'reported_text', result.reported_text,
      'unit', result.unit, 'lcm', result.lcm, 'uncertainty_text', result.uncertainty_text,
      'method_text', result.method_text, 'technique_text', result.technique_text,
      'accreditation_type', result.accreditation_type,
      'analysis_start', result.analysis_start, 'analysis_end', result.analysis_end,
      'test', jsonb_build_object('code', test.code, 'parameter_name', test.parameter_name),
      'laboratory', (select jsonb_build_object('name', laboratory.name)
        from public.laboratories laboratory where laboratory.id = result.laboratory_id),
      'execution_type', sample_test.execution_type,
      'assigned_laboratory', (select jsonb_build_object('name', laboratory.name)
        from public.laboratories laboratory where laboratory.id = sample_test.assigned_laboratory_id)
    ) order by report_result.display_order)
      from public.report_results report_result
      join public.results result on result.id = report_result.result_id
      join public.tests test on test.id = result.test_id
      left join public.sample_tests sample_test on sample_test.sample_id = result.sample_id
        and sample_test.test_id = result.test_id
      where report_result.report_id = p_report_id),
    'regulations', (select jsonb_agg(jsonb_build_object(
      'id', sample_regulation.id, 'column_order', report_column.column_order,
      'source', sample_regulation.source, 'confirmed', sample_regulation.confirmed,
      'name', regulation.name, 'version_name', regulation_version.version_name,
      'article', activity.article, 'activity', activity.activity,
      'discharge_type', activity.discharge_type,
      'limits', (select jsonb_agg(to_jsonb(lim) order by lim.test_id)
        from public.regulation_limits lim where lim.activity_id = activity.id)
    ) order by report_column.column_order)
      from public.report_regulation_columns report_column
      join public.sample_regulations sample_regulation on sample_regulation.id = report_column.sample_regulation_id
      join public.regulation_versions regulation_version on regulation_version.id = sample_regulation.regulation_version_id
      join public.regulations regulation on regulation.id = regulation_version.regulation_id
      join public.regulation_activities activity on activity.id = sample_regulation.activity_id
      where report_column.report_id = p_report_id)
  ) into snapshot_value;

  snapshot_hash := encode(extensions.digest(snapshot_value::text, 'sha256'), 'hex');
  insert into public.report_snapshots (report_id, snapshot_data, snapshot_hash)
  values (p_report_id, snapshot_value, snapshot_hash);

  update public.reports set status = 'ISSUED', code = report_code,
    issued_at = issued_time, updated_at = issued_time, updated_by = auth.uid()
  where id = p_report_id;
  perform public.log_audit('REPORT_ISSUED', 'REPORT', p_report_id, null,
    jsonb_build_object('code', report_code, 'issued_at', issued_time, 'snapshot_hash', snapshot_hash));
  return jsonb_build_object('ok', true, 'code', report_code, 'snapshot_hash', snapshot_hash);
end;
$$;
