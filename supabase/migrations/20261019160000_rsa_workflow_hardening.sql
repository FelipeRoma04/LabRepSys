create or replace function public.evaluate_report_validation_rule(
  p_rule_code text,
  p_report_id uuid
)
returns table(field_name text, message text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if p_rule_code = 'VAL_RSA_NO_TEMPLATE' then
    return query
      select 'template_id', 'Seleccione una plantilla aprobada.'
       where not exists (
         select 1
           from public.reports report
           join public.report_templates template
             on template.id = report.template_id
            and template.status = 'APPROVED'
          where report.id = p_report_id
       );
  elsif p_rule_code = 'VAL_RSA_NO_SAMPLES' then
    return query
      select 'report_samples', 'Seleccione al menos una muestra.'
       where not exists (
         select 1 from public.report_samples where report_id = p_report_id
       );
  elsif p_rule_code = 'VAL_RSA_NO_RESULTS' then
    return query
      select 'report_results', 'No hay resultados asociados al reporte.'
       where not exists (
         select 1 from public.report_results where report_id = p_report_id
       );
  end if;
end;
$$;

insert into public.validation_rules (code, description, severity, blocking, entity_type, validator_function)
values
  ('VAL_RSA_NO_TEMPLATE', 'La plantilla del reporte no está aprobada', 'ERROR', true, 'REPORT', 'public.evaluate_report_validation_rule(text,uuid)'::regprocedure),
  ('VAL_RSA_NO_SAMPLES', 'El reporte no tiene muestras asociadas', 'ERROR', true, 'REPORT', 'public.evaluate_report_validation_rule(text,uuid)'::regprocedure),
  ('VAL_RSA_NO_RESULTS', 'El reporte no tiene resultados asociados', 'ERROR', true, 'REPORT', 'public.evaluate_report_validation_rule(text,uuid)'::regprocedure)
on conflict (code) do update
  set active = true,
      validator_function = excluded.validator_function;

create or replace function public.save_report_draft(
  p_report_id uuid,
  p_client_id uuid,
  p_contact_id uuid,
  p_template_id uuid,
  p_sample_ids uuid[],
  p_result_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_report_id uuid;
  v_report public.reports%rowtype;
  v_sample_id uuid;
  v_result_id uuid;
begin
  if auth.uid() is null
     or not public.current_user_is_active()
     or not public.has_role('ANALISTA') then
    raise exception using errcode = '42501', message = 'No tiene permisos para guardar borradores RSA.';
  end if;

  if p_template_id is not null and not exists (
    select 1 from public.report_templates
     where id = p_template_id and status = 'APPROVED' and active
  ) then
    raise exception using errcode = '22023', message = 'Solo se pueden usar plantillas aprobadas y activas.';
  end if;

  if coalesce(cardinality(p_sample_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'Seleccione al menos una muestra.';
  end if;

  if p_client_id is null
     or exists (
       select 1 from public.samples sample
        where sample.id = any(p_sample_ids)
          and sample.client_id <> p_client_id
     )
     or exists (
       select 1 from unnest(p_sample_ids) selected_sample(sample_id)
        where not exists (
          select 1 from public.samples sample where sample.id = selected_sample.sample_id
        )
     ) then
    raise exception using errcode = '22023', message = 'El cliente debe coincidir con todas las muestras seleccionadas.';
  end if;

  if p_contact_id is not null and not exists (
    select 1 from public.contacts contact
     where contact.id = p_contact_id and contact.client_id = p_client_id and contact.active
  ) then
    raise exception using errcode = '22023', message = 'El contacto no pertenece al cliente seleccionado o está inactivo.';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_result_ids, array[]::uuid[])) selected_result(result_id)
     where not exists (
       select 1 from public.results result
        where result.id = selected_result.result_id
          and result.sample_id = any(p_sample_ids)
     )
  ) then
    raise exception using errcode = '22023', message = 'Todos los resultados deben pertenecer a las muestras seleccionadas.';
  end if;

  if p_report_id is null then
    insert into public.reports (
      client_id, contact_id, template_id, prepared_by, created_by, updated_by
    )
    values (
      p_client_id, p_contact_id, p_template_id, auth.uid(), auth.uid(), auth.uid()
    )
    returning id into v_report_id;
  else
    select * into v_report
      from public.reports
     where id = p_report_id
     for update;

    if not found
       or v_report.prepared_by <> auth.uid()
       or v_report.status not in ('DRAFT', 'RETURNED') then
      raise exception using errcode = '42501', message = 'Solo puede editar sus propios borradores o reportes devueltos.';
    end if;

    update public.reports
       set client_id = p_client_id,
           contact_id = p_contact_id,
           template_id = p_template_id,
           updated_by = auth.uid()
     where id = p_report_id;
    v_report_id := p_report_id;
  end if;

  delete from public.report_samples where report_id = v_report_id;
  delete from public.report_results where report_id = v_report_id;
  delete from public.report_regulation_columns where report_id = v_report_id;

  foreach v_sample_id in array coalesce(p_sample_ids, array[]::uuid[]) loop
    insert into public.report_samples (report_id, sample_id)
    values (v_report_id, v_sample_id);
  end loop;

  foreach v_result_id in array coalesce(p_result_ids, array[]::uuid[]) loop
    insert into public.report_results (report_id, result_id, display_order)
    values (v_report_id, v_result_id, array_position(p_result_ids, v_result_id));
  end loop;

  insert into public.report_regulation_columns (report_id, sample_regulation_id, column_order)
  select v_report_id, regulation.id, regulation.column_order
    from public.sample_regulations regulation
   where regulation.sample_id = any(p_sample_ids)
     and regulation.confirmed
   order by regulation.column_order, regulation.id;

  perform public.log_audit(
    case when p_report_id is null then 'REPORT_DRAFT_CREATED' else 'REPORT_DRAFT_UPDATED' end,
    'REPORT',
    v_report_id,
    null,
    jsonb_build_object('sample_count', cardinality(coalesce(p_sample_ids, array[]::uuid[])),
                       'result_count', cardinality(coalesce(p_result_ids, array[]::uuid[])))
  );

  return v_report_id;
end;
$$;

create or replace function public.transition_report(
  p_report_id uuid,
  p_to_status text,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_report public.reports%rowtype;
  v_validation_run_id uuid;
  v_is_deputy boolean;
  v_can_review boolean;
  v_denial text;
begin
  select * into v_report
    from public.reports
   where id = p_report_id
   for update;

  if not found then
    perform public.log_audit('REPORT_TRANSITION_DENIED', 'REPORT', p_report_id, null,
      jsonb_build_object('to_status', p_to_status, 'reason', 'NOT_FOUND'));
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND', 'message', 'Reporte no encontrado.');
  end if;

  if not public.current_user_is_active() then
    v_denial := 'INACTIVE_USER';
  elsif p_to_status in ('ISSUED', 'RECTIFIED', 'VOIDED') then
    v_denial := 'USE_DEDICATED_RPC';
  elsif not exists (
    select 1 from public.report_status_transitions
     where from_status = v_report.status and to_status = p_to_status
  ) then
    v_denial := 'INVALID_TRANSITION';
  elsif p_to_status in ('VALIDATING', 'READY_FOR_REVIEW', 'DRAFT')
    and (not public.has_role('ANALISTA') or v_report.prepared_by <> auth.uid()) then
    v_denial := 'INSUFFICIENT_ROLE';
  elsif p_to_status in ('IN_REVIEW', 'RETURNED')
    and not public.has_role('JEFE_TECNICA_CALIDAD') then
    v_denial := 'INSUFFICIENT_ROLE';
  elsif p_to_status = 'APPROVED'
    and not public.has_role('JEFE_TECNICA_CALIDAD')
    and not exists (
      select 1 from public.approval_deputies deputy
       where deputy.user_id = auth.uid()
         and deputy.active
         and deputy.valid_from <= current_date
         and (deputy.valid_until is null or deputy.valid_until >= current_date)
    ) then
    v_denial := 'INSUFFICIENT_ROLE';
  elsif p_to_status = 'RETURNED' and nullif(btrim(coalesce(p_comment, '')), '') is null then
    v_denial := 'COMMENT_REQUIRED';
  elsif p_to_status = 'APPROVED' and v_report.prepared_by = auth.uid() then
    v_denial := 'SEGREGATION_VIOLATION';
  end if;

  if v_denial is not null then
    perform public.log_audit('REPORT_TRANSITION_DENIED', 'REPORT', p_report_id,
      jsonb_build_object('status', v_report.status),
      jsonb_build_object('to_status', p_to_status, 'reason', v_denial, 'comment', p_comment));
    return jsonb_build_object(
      'ok', false,
      'error_code', v_denial,
      'message', case v_denial
        when 'INSUFFICIENT_ROLE' then 'No tiene permisos para realizar esta transición.'
        when 'SEGREGATION_VIOLATION' then 'Quien preparó el reporte no puede aprobarlo.'
        when 'COMMENT_REQUIRED' then 'Es obligatorio escribir un comentario para devolver el reporte.'
        when 'INVALID_TRANSITION' then 'La transición solicitada no está permitida.'
        when 'USE_DEDICATED_RPC' then 'Esta transición requiere la operación transaccional específica.'
        else 'La cuenta no está activa.'
      end
    );
  end if;

  if p_to_status in ('READY_FOR_REVIEW', 'IN_REVIEW', 'APPROVED') then
    if p_to_status in ('READY_FOR_REVIEW') then
      if exists (
        select 1
          from public.report_samples selected_sample
         where selected_sample.report_id = p_report_id
           and public.sample_has_pending_external_reports(selected_sample.sample_id)
      ) then
        perform public.log_audit('REPORT_TRANSITION_DENIED', 'REPORT', p_report_id, null,
          jsonb_build_object('to_status', p_to_status, 'reason', 'PENDING_EXTERNAL_REPORTS'));
        return jsonb_build_object('ok', false, 'error_code', 'PENDING_EXTERNAL_REPORTS',
          'message', 'Hay reportes subcontratados pendientes para una o más muestras.');
      end if;

      v_validation_run_id := public.run_validations('REPORT', p_report_id);
      if exists (
        select 1 from public.validation_issues issue
         where issue.validation_run_id = v_validation_run_id
           and issue.blocking and not issue.resolved
      ) then
        perform public.log_audit('REPORT_TRANSITION_DENIED', 'REPORT', p_report_id, null,
          jsonb_build_object('to_status', p_to_status, 'reason', 'BLOCKING_VALIDATIONS',
                             'validation_run_id', v_validation_run_id));
        return jsonb_build_object('ok', false, 'error_code', 'BLOCKING_VALIDATIONS',
          'message', 'Existen errores bloqueantes. Revise los hallazgos de validación.');
      end if;
    end if;

    select exists (
      select 1 from public.approval_deputies deputy
       where deputy.user_id = auth.uid()
         and deputy.active
         and deputy.valid_from <= current_date
         and (deputy.valid_until is null or deputy.valid_until >= current_date)
    ) into v_is_deputy;

    v_can_review := case
      when p_to_status in ('IN_REVIEW', 'RETURNED') then public.has_role('JEFE_TECNICA_CALIDAD')
      when p_to_status = 'APPROVED' then public.has_role('JEFE_TECNICA_CALIDAD') or v_is_deputy
      else true
    end;
    if p_to_status in ('IN_REVIEW', 'RETURNED', 'APPROVED') and not v_can_review then
      perform public.log_audit('REPORT_TRANSITION_DENIED', 'REPORT', p_report_id, null,
        jsonb_build_object('to_status', p_to_status, 'reason', 'INSUFFICIENT_ROLE'));
      return jsonb_build_object('ok', false, 'error_code', 'INSUFFICIENT_ROLE',
        'message', 'Solo la Jefatura de Técnica y Calidad o su suplente vigente puede revisar.');
    end if;
  end if;

  update public.reports
     set status = p_to_status,
         reviewed_by = case when p_to_status in ('IN_REVIEW', 'RETURNED', 'APPROVED') then auth.uid() else reviewed_by end,
         approved_by = case when p_to_status = 'APPROVED' then auth.uid() else approved_by end,
         updated_by = auth.uid()
   where id = p_report_id;

  if p_to_status in ('RETURNED', 'APPROVED') then
    insert into public.report_reviews (report_id, reviewer_id, decision, comments)
    values (p_report_id, auth.uid(), p_to_status, p_comment);
  end if;

  if p_to_status = 'APPROVED' then
    insert into public.report_approvals (report_id, approver_id, decision)
    values (p_report_id, auth.uid(), 'APPROVED');
  end if;

  perform public.log_audit('REPORT_TRANSITION', 'REPORT', p_report_id,
    jsonb_build_object('status', v_report.status),
    jsonb_build_object('status', p_to_status, 'comment', p_comment));

  return jsonb_build_object('ok', true, 'new_status', p_to_status);
end;
$$;

drop policy if exists "reports: analista own update" on public.reports;
drop policy if exists "reports: analista write" on public.reports;
create policy "reports: analyst insert own"
  on public.reports for insert to authenticated
  with check (
    prepared_by = auth.uid()
    and status = 'DRAFT'
    and public.has_role('ANALISTA')
  );

create policy "reports: analista own update"
  on public.reports for update to authenticated
  using (
    prepared_by = auth.uid()
    and status in ('DRAFT', 'RETURNED')
    and public.has_role('ANALISTA')
  )
  with check (
    prepared_by = auth.uid()
    and status in ('DRAFT', 'RETURNED')
    and public.has_role('ANALISTA')
  );

drop policy if exists "report_samples: read" on public.report_samples;
create policy "report_samples: authorized read"
  on public.report_samples for select to authenticated
  using (exists (
    select 1 from public.reports report
     where report.id = report_id
       and (report.prepared_by = auth.uid()
         or public.has_any_role(array['JEFE_TECNICA_CALIDAD', 'ADMIN', 'AUDITOR']))
  ));

drop policy if exists "report_samples: write" on public.report_samples;
drop policy if exists "report_samples: own draft write" on public.report_samples;
create policy "report_samples: own draft write"
  on public.report_samples for all to authenticated
  using (
    exists (select 1 from public.reports report
      where report.id = report_id and report.prepared_by = auth.uid()
        and report.status in ('DRAFT', 'RETURNED')
        and public.has_role('ANALISTA'))
  )
  with check (
    exists (select 1 from public.reports report
      where report.id = report_id and report.prepared_by = auth.uid()
        and report.status in ('DRAFT', 'RETURNED')
        and public.has_role('ANALISTA'))
  );

drop policy if exists "report_results: read" on public.report_results;
create policy "report_results: authorized read"
  on public.report_results for select to authenticated
  using (exists (
    select 1 from public.reports report
     where report.id = report_id
       and (report.prepared_by = auth.uid()
         or public.has_any_role(array['JEFE_TECNICA_CALIDAD', 'ADMIN', 'AUDITOR']))
  ));

drop policy if exists "report_results: write" on public.report_results;
drop policy if exists "report_results: own draft write" on public.report_results;
create policy "report_results: own draft write"
  on public.report_results for all to authenticated
  using (
    exists (select 1 from public.reports report
      where report.id = report_id and report.prepared_by = auth.uid()
        and report.status in ('DRAFT', 'RETURNED')
        and public.has_role('ANALISTA'))
  )
  with check (
    exists (select 1 from public.reports report
      where report.id = report_id and report.prepared_by = auth.uid()
        and report.status in ('DRAFT', 'RETURNED')
        and public.has_role('ANALISTA'))
  );

drop policy if exists "report_reviews: read" on public.report_reviews;
create policy "report_reviews: authorized read"
  on public.report_reviews for select to authenticated
  using (exists (
    select 1 from public.reports report
     where report.id = report_id
       and (report.prepared_by = auth.uid()
         or public.has_any_role(array['JEFE_TECNICA_CALIDAD', 'ADMIN', 'AUDITOR']))
  ));

drop policy if exists "report_approvals: read" on public.report_approvals;
create policy "report_approvals: authorized read"
  on public.report_approvals for select to authenticated
  using (exists (
    select 1 from public.reports report
     where report.id = report_id
       and (report.prepared_by = auth.uid()
         or public.has_any_role(array['JEFE_TECNICA_CALIDAD', 'ADMIN', 'AUDITOR']))
  ));

drop policy if exists "report_comments: read" on public.report_comments;
create policy "report_comments: authorized read"
  on public.report_comments for select to authenticated
  using (exists (
    select 1 from public.reports report
     where report.id = report_id
       and (report.prepared_by = auth.uid()
         or public.has_any_role(array['JEFE_TECNICA_CALIDAD', 'ADMIN', 'AUDITOR']))
  ));

drop policy if exists "report_reg_cols: read" on public.report_regulation_columns;
create policy "report_reg_cols: authorized read"
  on public.report_regulation_columns for select to authenticated
  using (exists (
    select 1 from public.reports report
     where report.id = report_id
       and (report.prepared_by = auth.uid()
         or public.has_any_role(array['JEFE_TECNICA_CALIDAD', 'ADMIN', 'AUDITOR']))
  ));

drop policy if exists "report_snapshots: read" on public.report_snapshots;
create policy "report_snapshots: authorized read"
  on public.report_snapshots for select to authenticated
  using (exists (
    select 1 from public.reports report
     where report.id = report_id
       and (report.prepared_by = auth.uid()
         or public.has_any_role(array['JEFE_TECNICA_CALIDAD', 'ADMIN', 'AUDITOR']))
  ));

drop policy if exists "report_files: read" on public.report_files;
create policy "report_files: authorized read"
  on public.report_files for select to authenticated
  using (exists (
    select 1 from public.reports report
     where report.id = report_id
       and (report.prepared_by = auth.uid()
         or public.has_any_role(array['JEFE_TECNICA_CALIDAD', 'ADMIN', 'AUDITOR']))
  ));

drop policy if exists "report_reg_cols: write" on public.report_regulation_columns;
create policy "report_reg_cols: own draft write"
  on public.report_regulation_columns for insert to authenticated
  with check (
    exists (select 1 from public.reports report
      where report.id = report_id and report.prepared_by = auth.uid()
        and report.status in ('DRAFT', 'RETURNED')
        and public.has_role('ANALISTA'))
  );

drop policy if exists "report_comments: write" on public.report_comments;
create policy "report_comments: authorized insert"
  on public.report_comments for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.reports report
       where report.id = report_id
         and (
           (report.prepared_by = auth.uid()
             and report.status in ('DRAFT', 'RETURNED')
             and public.has_role('ANALISTA'))
           or public.has_any_role(array['JEFE_TECNICA_CALIDAD', 'ADMIN'])
         )
    )
  );

create or replace function public.get_report_history(p_report_id uuid)
returns table (
  created_at timestamptz,
  action text,
  old_data jsonb,
  new_data jsonb,
  reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null or not public.current_user_is_active()
     or not exists (
       select 1 from public.reports report
        where report.id = p_report_id
          and (
            report.prepared_by = auth.uid()
            or public.has_any_role(array['ADMIN', 'JEFE_TECNICA_CALIDAD', 'AUDITOR'])
          )
     ) then
    raise exception using errcode = '42501', message = 'No tiene permiso para consultar el historial del reporte.';
  end if;

  return query
    select audit.created_at, audit.action, audit.old_data, audit.new_data, audit.reason
      from public.audit_logs audit
     where audit.entity_type = 'REPORT'
       and audit.entity_id = p_report_id
     order by audit.created_at;
end;
$$;

create or replace function public.add_report_comment(
  p_report_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_report public.reports%rowtype;
  v_comment_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_active()
     or nullif(btrim(coalesce(p_comment, '')), '') is null
     or p_entity_type not in ('REPORT', 'RESULT', 'FIELD') then
    raise exception using errcode = '22023', message = 'El comentario no es válido.';
  end if;

  select * into v_report
    from public.reports
   where id = p_report_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Reporte no encontrado.';
  end if;

  if not (
    (v_report.prepared_by = auth.uid()
      and v_report.status in ('DRAFT', 'RETURNED')
      and public.has_role('ANALISTA'))
    or (public.has_role('JEFE_TECNICA_CALIDAD')
      and v_report.status in ('READY_FOR_REVIEW', 'IN_REVIEW', 'RETURNED'))
  ) then
    perform public.log_audit('REPORT_COMMENT_DENIED', 'REPORT', p_report_id, null,
      jsonb_build_object('entity_type', p_entity_type, 'reason', 'INSUFFICIENT_ROLE'));
    return jsonb_build_object('ok', false, 'error_code', 'INSUFFICIENT_ROLE',
      'message', 'No tiene permiso para comentar este reporte.');
  end if;

  if p_entity_type = 'RESULT' and (
    p_entity_id is null
    or not exists (
      select 1 from public.report_results
       where report_id = p_report_id and result_id = p_entity_id
    )
  ) then
    raise exception using errcode = '22023', message = 'Seleccione un resultado incluido en el reporte.';
  end if;

  insert into public.report_comments (
    report_id, entity_type, entity_id, comment, created_by
  )
  values (p_report_id, p_entity_type, p_entity_id, btrim(p_comment), auth.uid())
  returning id into v_comment_id;

  perform public.log_audit('REPORT_COMMENT_CREATED', 'REPORT', p_report_id, null,
    jsonb_build_object('comment_id', v_comment_id, 'entity_type', p_entity_type, 'entity_id', p_entity_id));

  return jsonb_build_object('ok', true, 'comment_id', v_comment_id);
end;
$$;

grant execute on function public.save_report_draft(uuid, uuid, uuid, uuid, uuid[], uuid[]) to authenticated;
grant execute on function public.get_report_history(uuid) to authenticated;
grant execute on function public.add_report_comment(uuid, text, uuid, text) to authenticated;
revoke insert, update, delete on public.report_reviews, public.report_approvals from authenticated;
drop policy if exists "report_reviews: write" on public.report_reviews;
drop policy if exists "report_approvals: write" on public.report_approvals;
revoke insert on public.report_comments from authenticated;
drop policy if exists "report_comments: authorized insert" on public.report_comments;
revoke update on public.reports from authenticated;
grant update (client_id, contact_id, template_id) on public.reports to authenticated;
revoke all on function public.evaluate_report_validation_rule(text, uuid) from public, anon, authenticated;
grant execute on function public.evaluate_report_validation_rule(text, uuid) to authenticated;
