-- Anulación transaccional de reportes emitidos (2026-11-23).
--
-- void_report(reporte, motivo) pasa un reporte ISSUED a VOIDED. Lo conserva
-- entero (snapshot, archivos y número no se borran ni se reutilizan) y deja
-- constancia de quién, cuándo y por qué lo anuló.
--
-- Reglas:
-- - Solo reportes ISSUED. Motivo obligatorio (mínimo 10 caracteres).
-- - Rol: parámetro report.void.allowed_roles (por defecto JEFE_TECNICA_CALIDAD,
--   el mismo rol que emite). Decisión de calidad pendiente: ajustarlo ahí.
-- - Segregación: quien preparó el reporte no puede anularlo.
-- - Cada anulación y cada intento denegado quedan auditados.

alter table public.reports
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete restrict,
  add column if not exists void_reason text;

alter table public.reports
  drop constraint if exists reports_voided_fields_check;
alter table public.reports
  add constraint reports_voided_fields_check check (
    status <> 'VOIDED'
    or (voided_at is not null and voided_by is not null and nullif(btrim(void_reason), '') is not null)
  );

insert into public.app_settings (key, value, description)
values (
  'report.void.allowed_roles',
  '["JEFE_TECNICA_CALIDAD"]'::jsonb,
  'Roles que pueden anular reportes emitidos (void_report). Pendiente de confirmar con el área de calidad.'
)
on conflict (key) do nothing;

create or replace function public.void_report(p_report_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_report public.reports%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_allowed_roles text[];
  v_denial text;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.current_user_is_active() then
    raise exception using errcode = '42501', message = 'Usuario activo requerido';
  end if;
  if length(v_reason) < 10 then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'message', 'Escribe el motivo de la anulación (al menos 10 caracteres).');
  end if;

  select * into v_report from public.reports where id = p_report_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND', 'message', 'Reporte no encontrado.');
  end if;

  select coalesce(array_agg(role_code), array['JEFE_TECNICA_CALIDAD'])
    into v_allowed_roles
    from public.app_settings setting,
         jsonb_array_elements_text(setting.value) as role_code
   where setting.key = 'report.void.allowed_roles'
     and jsonb_typeof(setting.value) = 'array';

  if v_report.status <> 'ISSUED' then
    v_denial := 'INVALID_STATUS';
  elsif not public.has_any_role(v_allowed_roles) then
    v_denial := 'INSUFFICIENT_ROLE';
  elsif v_report.prepared_by = auth.uid() then
    v_denial := 'SEGREGATION_VIOLATION';
  end if;

  if v_denial is not null then
    perform public.log_audit('REPORT_VOID_DENIED', 'REPORT', p_report_id,
      jsonb_build_object('status', v_report.status),
      jsonb_build_object('reason', v_denial, 'void_reason', v_reason));
    return jsonb_build_object(
      'ok', false,
      'error_code', v_denial,
      'message', case v_denial
        when 'INVALID_STATUS' then 'Solo se puede anular un reporte emitido.'
        when 'INSUFFICIENT_ROLE' then 'Tu rol no permite anular reportes emitidos.'
        else 'Quien preparó el reporte no puede anularlo.'
      end
    );
  end if;

  update public.reports
     set status = 'VOIDED',
         voided_at = v_now,
         voided_by = auth.uid(),
         void_reason = v_reason,
         updated_at = v_now,
         updated_by = auth.uid()
   where id = p_report_id;

  perform public.log_audit('REPORT_VOIDED', 'REPORT', p_report_id,
    jsonb_build_object('status', 'ISSUED', 'code', v_report.code),
    jsonb_build_object('status', 'VOIDED', 'code', v_report.code, 'voided_at', v_now),
    v_reason);

  return jsonb_build_object('ok', true, 'code', v_report.code, 'voided_at', v_now);
end;
$$;

revoke all on function public.void_report(uuid, text) from public, anon;
grant execute on function public.void_report(uuid, text) to authenticated;
