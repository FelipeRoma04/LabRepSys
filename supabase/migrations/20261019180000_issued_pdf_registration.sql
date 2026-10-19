-- Register signed-off PDF artifacts without allowing direct metadata writes.
drop policy if exists "report_files: write" on public.report_files;
revoke insert on public.report_files from authenticated;

create or replace function public.register_issued_report_file(
  p_report_id uuid,
  p_storage_path text,
  p_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, storage
as $$
declare
  file_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_active()
     or not public.has_role('ADMIN') then
    perform public.log_audit('REGISTER_REPORT_FILE_DENIED', 'REPORT', p_report_id,
      null, jsonb_build_object('reason', 'rol insuficiente'));
    return jsonb_build_object('ok', false, 'error_code', 'INSUFFICIENT_ROLE',
      'message', 'Solo ADMIN puede registrar el PDF final.');
  end if;

  if p_sha256 !~ '^[0-9a-f]{64}$'
     or p_storage_path is null
     or p_storage_path !~ ('^reports/' || p_report_id::text || '/[^/]+\.pdf$') then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_FILE');
  end if;

  if not exists (
    select 1 from public.reports report
    where report.id = p_report_id and report.status = 'ISSUED'
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'REPORT_NOT_ISSUED');
  end if;

  if not exists (
    select 1 from storage.objects stored_object
    where stored_object.bucket_id = 'issued-reports'
      and stored_object.name = p_storage_path
      and stored_object.metadata ->> 'mimetype' = 'application/pdf'
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'FILE_NOT_FOUND');
  end if;

  insert into public.report_files (report_id, file_type, storage_path, sha256)
  values (p_report_id, 'FINAL_PDF', p_storage_path, p_sha256)
  returning id into file_id;

  perform public.log_audit('FINAL_PDF_REGISTERED', 'REPORT', p_report_id,
    null, jsonb_build_object('file_id', file_id, 'sha256', p_sha256));
  return jsonb_build_object('ok', true, 'file_id', file_id);
end;
$$;

revoke all on function public.register_issued_report_file(uuid, text, text) from public, anon;
grant execute on function public.register_issued_report_file(uuid, text, text) to authenticated;
