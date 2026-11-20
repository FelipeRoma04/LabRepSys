-- Numeración de RSA y códigos fijos de laboratorios subcontratados (SA1, SA2, SA3…).

-- 1. Formato del número de RSA. issue_report exige esta clave y nunca se había creado,
--    por lo que la emisión fallaba con INVALID_CODE_FORMAT. El formato reproduce los
--    reportes vigentes ("RSA 0106-2026"). Si ya existe, no se modifica.
insert into public.app_settings (key, value, description)
values (
  'document.format.RSA',
  to_jsonb('RSA NNNN-AAAA'::text),
  'Formato del número de reporte. NNNN = consecutivo anual (mínimo 4 dígitos), AAAA = año de emisión.'
)
on conflict (key) do nothing;

-- 2. Continuidad con la numeración manual del libro de recepción.
--    El ADMIN fija el último número ya usado en un año para que el sistema siga desde
--    ahí (p. ej. set_counter_floor('RSA', 2026, 129) → el siguiente es RSA 0130-2026).
--    Solo puede subir el contador: bajarlo permitiría números duplicados.
create or replace function public.set_counter_floor(
  p_counter_code text,
  p_period_year integer,
  p_last_value bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_current bigint;
begin
  if auth.uid() is null or not public.current_user_is_active() or not public.has_role('ADMIN') then
    raise exception using errcode = '42501', message = 'Solo ADMIN puede ajustar consecutivos.';
  end if;
  if p_counter_code is null or btrim(p_counter_code) = '' or p_period_year is null
     or p_last_value is null or p_last_value < 0 then
    raise exception using errcode = '22023', message = 'Código, año y último valor (>= 0) son requeridos.';
  end if;

  select last_value into v_current
  from public.document_counters
  where counter_code = p_counter_code and period_year = p_period_year
  for update;

  if v_current is not null and p_last_value < v_current then
    raise exception using errcode = '22023',
      message = format('El consecutivo %s-%s ya va en %s; no se puede bajar a %s.', p_counter_code, p_period_year, v_current, p_last_value);
  end if;

  insert into public.document_counters (counter_code, period_year, last_value)
  values (p_counter_code, p_period_year, p_last_value)
  on conflict on constraint document_counters_pkey
  do update set last_value = excluded.last_value;

  perform public.log_audit(
    'COUNTER_FLOOR_SET', 'DOCUMENT_COUNTER', null,
    jsonb_build_object('counter_code', p_counter_code, 'period_year', p_period_year, 'last_value', v_current),
    jsonb_build_object('counter_code', p_counter_code, 'period_year', p_period_year, 'last_value', p_last_value)
  );
  return jsonb_build_object('ok', true, 'counter_code', p_counter_code, 'period_year', p_period_year,
    'last_value', p_last_value, 'next_value', p_last_value + 1);
end;
$$;

revoke all on function public.set_counter_floor(text, integer, bigint) from public, anon;
grant execute on function public.set_counter_floor(text, integer, bigint) to authenticated;

-- 3. Código fijo del laboratorio en el reporte (decisión: fijo por laboratorio, no por
--    orden de aparición). Único y con formato SA<n>.
alter table public.laboratories
  add column if not exists report_code text;

alter table public.laboratories
  add constraint laboratories_report_code_format
    check (report_code is null or report_code ~ '^SA[1-9][0-9]*$');

create unique index if not exists laboratories_report_code_unique
  on public.laboratories (report_code)
  where report_code is not null;

comment on column public.laboratories.report_code is
  'Código del laboratorio subcontratado en el RSA (SA1, SA2…). Su resolución de acreditación está en laboratory_accreditations.';

-- Asignación inicial Chemilab=SA1, AGQ=SA2, IHA=SA3: solo si hay exactamente un
-- laboratorio que coincide y aún no tiene código. Si no, se deja para el catálogo.
do $$
declare
  mapping record;
  matches integer;
begin
  for mapping in
    select * from (values
      ('SA1', '^chemilab'),
      ('SA2', '^agq'),
      ('SA3', '^(iha|instituto de higiene ambiental)')
    ) as m(report_code, pattern)
  loop
    if exists (select 1 from public.laboratories where report_code = mapping.report_code) then
      continue;
    end if;
    select count(*) into matches
    from public.laboratories
    where report_code is null
      and laboratory_type = 'EXTERNAL'
      and (lower(code) ~ mapping.pattern or lower(name) ~ mapping.pattern);
    if matches = 1 then
      update public.laboratories
         set report_code = mapping.report_code
       where report_code is null
         and laboratory_type = 'EXTERNAL'
         and (lower(code) ~ mapping.pattern or lower(name) ~ mapping.pattern);
    else
      raise notice 'No se asignó % automáticamente (% coincidencias). Asígnelo en Catálogos → Laboratorios.',
        mapping.report_code, matches;
    end if;
  end loop;
end;
$$;
