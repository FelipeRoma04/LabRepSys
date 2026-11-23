-- Corrige tres errores del esquema detectados al reactivar las pruebas pgTAP
-- y aplica dos decisiones de acceso (2026-11-23).
--
-- 1. audit_result_workflow_change leía new.confirmed, columna que no existe en
--    results: todo INSERT en results fallaba (rompía "Confirmar fila").
-- 2. reports_prevent_status_update bloqueaba también a transition_report e
--    issue_report: ningún reporte podía cambiar de estado. Ahora solo bloquea
--    los UPDATE directos de clientes (roles authenticated/anon); las funciones
--    SECURITY DEFINER corren como su dueño y quedan permitidas.
-- 3. run_validations formateaba un regprocedure con %s y generaba
--    "fn(text,uuid)($1, $2)": fallaba siempre que hubiera reglas activas.
-- 4. Decisión: un usuario activo sin rol no lee catálogos (mínimo privilegio).
-- 5. Decisión: los clientes no tienen UPDATE ni DELETE sobre las tablas del
--    reporte; solo escriben las funciones del sistema (SECURITY DEFINER).

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
      -- to_jsonb evita referenciar new.confirmed, que no existe en results ni en result_imports.
      when tg_table_name = 'import_rows'
        and coalesce((to_jsonb(new) ->> 'confirmed')::boolean, false)
        and not coalesce((to_jsonb(old) ->> 'confirmed')::boolean, false) then 'RESULT_CONFIRMED'
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

create or replace function public.prevent_direct_report_status_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.status is distinct from new.status and current_user in ('authenticated', 'anon') then
    raise exception using
      errcode = '42501',
      message = 'El estado del reporte solo puede cambiarse mediante transition_report o issue_report.';
  end if;
  return new;
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
    -- validator_function es regprocedure: como texto incluye la firma
    -- ("fn(text,uuid)"), así que el nombre se arma desde pg_proc.
    for finding_field, finding_message in execute (
      select format('select field_name, message from %I.%I($1, $2)', ns.nspname, proc.proname)
        from pg_catalog.pg_proc proc
        join pg_catalog.pg_namespace ns on ns.oid = proc.pronamespace
       where proc.oid = rule_record.validator_function
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

-- 4. Catálogos: lectura solo para usuarios activos con al menos un rol.
create or replace function public.current_user_has_role()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_user_is_active()
    and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid());
$$;

revoke all on function public.current_user_has_role() from public, anon;
grant execute on function public.current_user_has_role() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'matrices', 'methods', 'laboratories', 'laboratory_accreditations',
    'laboratory_accredited_tests', 'tests', 'test_aliases', 'test_groups',
    'test_group_members', 'report_templates', 'holidays'
  ] loop
    if exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = table_name
         and policyname = table_name || '_select_active'
    ) then
      execute format(
        'alter policy %I on public.%I using (active and public.current_user_has_role())',
        table_name || '_select_active', table_name
      );
    end if;
  end loop;
end;
$$;

-- 5. Tablas del reporte: sin UPDATE ni DELETE directos para clientes.
revoke update, delete on
  public.reports, public.report_samples, public.report_results,
  public.report_regulation_columns, public.report_reviews, public.report_approvals,
  public.report_snapshots, public.report_files
from anon, authenticated;
