-- K05: Asistente de migración y calidad de datos históricos
-- Req 1.3: tabla legacy_code_mappings y RPC confirm_legacy_mapping
-- Req 2.1: vistas de calidad de datos por categoría

-- ─── Tabla de mapeos de códigos heredados ────────────────────────────────────
create table if not exists public.legacy_code_mappings (
  id               uuid    primary key default gen_random_uuid(),
  legacy_code      text    not null,
  legacy_source    text    not null check (legacy_source in ('AGQ', 'CHEM', 'SGI')),
  proposed_test_id uuid    references public.tests(id) on delete restrict,
  status           text    not null default 'PROPOSED'
                     check (status in ('PROPOSED', 'CONFIRMED', 'REJECTED')),
  decided_by       uuid    references public.profiles(id) on delete restrict,
  decided_at       timestamptz,
  reason           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid    references public.profiles(id) on delete restrict,
  updated_by       uuid    references public.profiles(id) on delete restrict,
  unique (legacy_code, legacy_source)
);

drop trigger if exists legacy_code_mappings_set_updated_at on public.legacy_code_mappings;
create trigger legacy_code_mappings_set_updated_at
before update on public.legacy_code_mappings
for each row execute function public.set_updated_at();

alter table public.legacy_code_mappings enable row level security;
revoke all on public.legacy_code_mappings from anon, authenticated;
grant select, insert, update on public.legacy_code_mappings to authenticated;

-- ADMIN y JEFE_TECNICA_CALIDAD pueden confirmar mapeos; AUDITOR solo lee
drop policy if exists "legacy_mappings: read authorized" on public.legacy_code_mappings;
create policy "legacy_mappings: read authorized"
  on public.legacy_code_mappings for select to authenticated
  using (public.has_any_role(array['ADMIN', 'JEFE_TECNICA_CALIDAD', 'AUDITOR']));

drop policy if exists "legacy_mappings: write admin_jtc" on public.legacy_code_mappings;
create policy "legacy_mappings: write admin_jtc"
  on public.legacy_code_mappings for insert to authenticated
  with check (public.has_any_role(array['ADMIN', 'JEFE_TECNICA_CALIDAD']));

drop policy if exists "legacy_mappings: update admin_jtc" on public.legacy_code_mappings;
create policy "legacy_mappings: update admin_jtc"
  on public.legacy_code_mappings for update to authenticated
  using (public.has_any_role(array['ADMIN', 'JEFE_TECNICA_CALIDAD']))
  with check (public.has_any_role(array['ADMIN', 'JEFE_TECNICA_CALIDAD']));

-- ─── RPC: confirm_legacy_mapping ─────────────────────────────────────────────
-- Req 1.3: confirmar crea alias LEGACY_CODE en test_aliases y audita
-- Devuelve {ok, error_code, message} — nunca RAISE para que la auditoría no revierta
create or replace function public.confirm_legacy_mapping(
  p_mapping_id uuid,
  p_decision   text,    -- 'CONFIRMED' o 'REJECTED'
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_mapping public.legacy_code_mappings%rowtype;
begin
  if auth.uid() is null or not public.current_user_is_active() then
    return jsonb_build_object('ok', false, 'error_code', 'INACTIVE_USER',
      'message', 'Se requiere sesión de usuario activo.');
  end if;

  if not public.has_any_role(array['ADMIN', 'JEFE_TECNICA_CALIDAD']) then
    perform public.log_audit('CONFIRM_LEGACY_MAPPING_DENIED', 'LEGACY_MAPPING', p_mapping_id,
      null, jsonb_build_object('reason', 'rol insuficiente', 'user_id', auth.uid()));
    return jsonb_build_object('ok', false, 'error_code', 'INSUFFICIENT_ROLE',
      'message', 'Se requiere rol ADMIN o JEFE_TECNICA_CALIDAD.');
  end if;

  if p_decision not in ('CONFIRMED', 'REJECTED') then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DECISION',
      'message', 'La decisión debe ser CONFIRMED o REJECTED.');
  end if;

  if p_decision = 'REJECTED' and btrim(coalesce(p_reason, '')) = '' then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'message', 'El motivo es obligatorio para rechazar un mapeo.');
  end if;

  select * into v_mapping
  from public.legacy_code_mappings
  where id = p_mapping_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND',
      'message', 'Mapeo no encontrado.');
  end if;

  if v_mapping.status <> 'PROPOSED' then
    return jsonb_build_object('ok', false, 'error_code', 'ALREADY_DECIDED',
      'message', 'Este mapeo ya fue procesado.');
  end if;

  -- Si se confirma, crear el alias LEGACY_CODE
  if p_decision = 'CONFIRMED' then
    if v_mapping.proposed_test_id is null then
      return jsonb_build_object('ok', false, 'error_code', 'NO_TEST',
        'message', 'Se requiere un ensayo SA para confirmar el mapeo.');
    end if;

    insert into public.test_aliases (
      test_id, alias_type, external_code, created_by, updated_by
    )
    values (
      v_mapping.proposed_test_id,
      'LEGACY_CODE',
      v_mapping.legacy_source,
      auth.uid(),
      auth.uid()
    )
    on conflict do nothing;
  end if;

  -- Actualizar el mapeo
  update public.legacy_code_mappings
  set
    status      = p_decision,
    decided_by  = auth.uid(),
    decided_at  = now(),
    reason      = p_reason,
    updated_by  = auth.uid(),
    updated_at  = now()
  where id = p_mapping_id;

  perform public.log_audit(
    'LEGACY_MAPPING_' || p_decision,
    'LEGACY_MAPPING',
    p_mapping_id,
    to_jsonb(v_mapping),
    jsonb_build_object('status', p_decision, 'reason', p_reason)
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.confirm_legacy_mapping(uuid, text, text) to authenticated;
revoke all on function public.confirm_legacy_mapping(uuid, text, text) from public, anon;

-- ─── Vista: códigos heredados sin mapeo SA ───────────────────────────────────
-- Req 1.1: detectar alias LEGACY_CODE sin correspondencia confirmada
create or replace view public.v_unmapped_legacy_codes
with (security_invoker = true)
as
select
  ta.external_code as legacy_source,
  ta.external_name as legacy_name,
  ta.id            as alias_id,
  ta.test_id,
  t.code           as sa_code,
  t.parameter_name,
  not exists (
    select 1 from public.legacy_code_mappings lcm
    where lcm.legacy_code = coalesce(ta.external_name, ta.external_code)
      and lcm.legacy_source = ta.external_code
      and lcm.status = 'CONFIRMED'
  ) as needs_mapping
from public.test_aliases ta
join public.tests t on t.id = ta.test_id
where ta.alias_type = 'LEGACY_CODE'
  and ta.active
  and t.active;

-- ─── Vistas de calidad de datos ───────────────────────────────────────────────

-- Req 2.1a: Clientes con NIT duplicado o razón social similar
create or replace view public.v_quality_clients
with (security_invoker = true)
as
select
  c.id,
  c.business_name,
  c.nit,
  c.active,
  'NIT duplicado o vacío' as issue_type,
  '/clientes'             as correction_path
from public.clients c
where
  (c.nit is not null and (
    select count(*) from public.clients c2
    where c2.nit = c.nit and c2.id <> c.id
  ) > 0)
  or c.nit is null or btrim(c.nit) = ''
union all
-- Razón social idéntica a otro cliente (búsqueda exacta; similitud vía pg_trgm queda en el frontend)
select
  c.id,
  c.business_name,
  c.nit,
  c.active,
  'Razón social duplicada' as issue_type,
  '/clientes'              as correction_path
from public.clients c
where (
  select count(*) from public.clients c2
  where lower(c2.business_name) = lower(c.business_name) and c2.id <> c.id
) > 0;

-- Req 2.1b: Ensayos con campos requeridos incompletos o "FALTA INFO"
create or replace view public.v_quality_tests
with (security_invoker = true)
as
select
  t.id,
  t.code,
  t.parameter_name,
  t.active,
  array_remove(missing.fields, null) as missing_fields,
  '/catalogos/ensayos'               as correction_path
from public.tests t
cross join lateral (
  select array[
    case when nullif(btrim(coalesce(t.parameter_name,'')), '') is null
           or upper(t.parameter_name) = 'FALTA INFO' then 'parameter_name' end,
    case when nullif(btrim(coalesce(t.default_unit,'')), '') is null
           or upper(t.default_unit) = 'FALTA INFO' then 'default_unit' end,
    case when t.method_id is null then 'method_id' end,
    case when nullif(btrim(coalesce(t.technique,'')), '') is null
           or upper(t.technique) = 'FALTA INFO' then 'technique' end,
    case when t.lcm is null then 'lcm' end,
    case when t.accreditation_type is null then 'accreditation_type' end
  ]::text[] as fields
) as missing
where t.active
  and cardinality(array_remove(missing.fields, null)) > 0;

-- Req 2.1c: Resumen por categoría para indicadores de avance
create or replace view public.v_quality_summary
with (security_invoker = true)
as
select 'clients'           as category,
       count(*)::int       as total_issues
from public.v_quality_clients
union all
select 'tests',
       count(*)::int
from public.v_quality_tests
union all
select 'legacy_mappings_pending',
       count(*)::int
from public.legacy_code_mappings
where status = 'PROPOSED';

revoke all on public.v_unmapped_legacy_codes, public.v_quality_clients,
              public.v_quality_tests, public.v_quality_summary
  from anon, authenticated;

grant select on public.v_unmapped_legacy_codes, public.v_quality_clients,
               public.v_quality_tests, public.v_quality_summary
  to authenticated;
