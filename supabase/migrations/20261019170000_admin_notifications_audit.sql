-- Complete the p13 administration and personal notification access rules.

-- notifications has no updated_at column, so its original updated_at trigger
-- prevented users from marking a notification as read.
drop trigger if exists notifications_no_update on public.notifications;
drop policy if exists "notifications: insert" on public.notifications;
create policy "notifications: insert own"
  on public.notifications for insert to authenticated
  with check (user_id = auth.uid() and public.current_user_is_active());

drop policy if exists "notifications: own update" on public.notifications;
create policy "notifications: own read state"
  on public.notifications for update to authenticated
  using (user_id = auth.uid() and public.current_user_is_active())
  with check (user_id = auth.uid() and public.current_user_is_active());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.audit_pending_decision_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if row(old.status, old.decision_text, old.decided_by, old.decided_at, old.evidence)
     is distinct from
     row(new.status, new.decision_text, new.decided_by, new.decided_at, new.evidence) then
    perform public.log_audit(
      'PENDING_DECISION_UPDATED', 'PENDING_DECISION', new.id,
      to_jsonb(old), to_jsonb(new), new.decision_text
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_pending_decision_change() from public, anon, authenticated;
drop trigger if exists pending_decisions_audit_update on public.pending_decisions;
create trigger pending_decisions_audit_update
  after update on public.pending_decisions
  for each row execute function public.audit_pending_decision_change();

create or replace function public.notify_report_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.status is distinct from old.status and new.status in ('RETURNED', 'APPROVED') then
    insert into public.notifications (user_id, type, entity_type, entity_id, message)
    values (
      new.prepared_by,
      case new.status when 'RETURNED' then 'RETURNED' else 'APPROVED' end,
      'REPORT',
      new.id,
      case new.status
        when 'RETURNED' then 'El reporte fue devuelto para corrección.'
        else 'El reporte fue aprobado.'
      end
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_report_status_change() from public, anon, authenticated;
drop trigger if exists reports_notify_preparer on public.reports;
create trigger reports_notify_preparer
  after update of status on public.reports
  for each row execute function public.notify_report_status_change();

create or replace function public.notify_validation_error()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.status = 'COMPLETED' and old.status is distinct from new.status
     and exists (
       select 1 from public.validation_issues issue
       where issue.validation_run_id = new.id and issue.blocking and not issue.resolved
     ) then
    insert into public.notifications (user_id, type, entity_type, entity_id, message)
    select new.executed_by, 'VALIDATION_ERROR', new.entity_type, new.entity_id,
      'La validación encontró errores bloqueantes.'
    where new.executed_by is not null;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_validation_error() from public, anon, authenticated;
drop trigger if exists validation_runs_notify_errors on public.validation_runs;
create trigger validation_runs_notify_errors
  after update of status on public.validation_runs
  for each row execute function public.notify_validation_error();

create or replace function public.get_dashboard_summary(p_since timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if not public.current_user_is_active() then
    raise exception using errcode = '42501', message = 'Se requiere un usuario activo.';
  end if;

  select jsonb_build_object(
    'samples_received', (
      select count(*) from public.samples sample
      where sample.received_at >= coalesce(p_since, '-infinity'::timestamptz)
    ),
    'samples_pending', (
      select count(*) from public.samples sample
      where sample.status = 'PENDING_REVIEW'
        and sample.received_at >= coalesce(p_since, '-infinity'::timestamptz)
    ),
    'reports', coalesce((
      select jsonb_object_agg(status_label, total)
      from (
        select case report.status
          when 'DRAFT' then 'En preparación'
          when 'VALIDATING' then 'En preparación'
          when 'RETURNED' then 'En preparación'
          when 'READY_FOR_REVIEW' then 'En revisión'
          when 'IN_REVIEW' then 'En revisión'
          when 'APPROVED' then 'Aprobados'
          when 'ISSUED' then 'Emitidos'
          else report.status
        end as status_label,
        count(*) as total
        from public.reports report
        where report.updated_at >= coalesce(p_since, '-infinity'::timestamptz)
        group by 1
      ) grouped_reports
    ), '{}'::jsonb),
    'execution', coalesce((
      select jsonb_object_agg(execution_class, total)
      from (
        select classification.execution_class, count(*) as total
        from public.v_test_execution_classification classification
        group by classification.execution_class
      ) grouped_execution
    ), '{}'::jsonb),
    'pending_external', coalesce((
      select jsonb_object_agg(laboratory_name, total)
      from (
        select pending.laboratory_name, count(*) as total
        from public.v_pending_external_reports pending
        group by pending.laboratory_name
      ) grouped_external
    ), '{}'::jsonb),
    'recent', case
      when public.has_any_role(array['ADMIN', 'JEFE_TECNICA_CALIDAD', 'AUDITOR']) then coalesce((
        select jsonb_agg(to_jsonb(recent_row) order by recent_row.created_at desc)
        from (
          select audit.id, audit.action, audit.entity_type, audit.entity_id, audit.created_at
          from public.audit_logs audit
          where audit.created_at >= coalesce(p_since, '-infinity'::timestamptz)
          order by audit.created_at desc limit 10
        ) recent_row
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_dashboard_summary(timestamptz) from public, anon;
grant execute on function public.get_dashboard_summary(timestamptz) to authenticated;
