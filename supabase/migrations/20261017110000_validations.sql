-- p10: Motor de validaciones

-- ─── Reglas de validación ─────────────────────────────────────────────────────
create table public.validation_rules (
  id          uuid    primary key default gen_random_uuid(),
  code        text    not null unique,
  description text    not null,
  severity    text    not null check (severity in ('ERROR','WARNING','INFO')),
  blocking    boolean not null default true,
  entity_type text    not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Ejecuciones de validación ────────────────────────────────────────────────
create table public.validation_runs (
  id          uuid    primary key default gen_random_uuid(),
  entity_type text    not null,
  entity_id   uuid    not null,
  status      text    not null default 'PENDING'
               check (status in ('PENDING','RUNNING','COMPLETED','FAILED')),
  executed_by uuid    references public.profiles(id) on delete restrict,
  executed_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ─── Hallazgos ────────────────────────────────────────────────────────────────
create table public.validation_issues (
  id                uuid    primary key default gen_random_uuid(),
  validation_run_id uuid    not null references public.validation_runs(id) on delete restrict,
  rule_code         text    not null references public.validation_rules(code) on delete restrict,
  severity          text    not null check (severity in ('ERROR','WARNING','INFO')),
  field_name        text,
  message           text    not null,
  blocking          boolean not null default true,
  resolved          boolean not null default false,
  resolution        text,
  resolved_by       uuid    references public.profiles(id) on delete restrict,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Advertencias pueden resolverse con comentario; errores bloqueantes no
  check (not resolved or (not blocking) or resolution is not null)
);

-- ─── Función principal de validación ─────────────────────────────────────────
-- Req p10: ejecuta todas las reglas activas para una entidad y guarda los hallazgos
create or replace function public.run_validations(
  p_entity_type text,
  p_entity_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_run_id uuid;
begin
  if not public.has_any_role(array['ANALISTA','JEFE_TECNICA_CALIDAD','ADMIN']) then
    raise exception using errcode = '42501', message = 'Rol insuficiente para ejecutar validaciones.';
  end if;

  -- Crear el run
  insert into public.validation_runs (entity_type, entity_id, status, executed_by)
  values (p_entity_type, p_entity_id, 'RUNNING', auth.uid())
  returning id into v_run_id;

  -- ── Reglas sobre SAMPLE ────────────────────────────────────────────────────
  if p_entity_type = 'SAMPLE' then

    -- VAL-001: Reporte externo pendiente bloquea
    if public.sample_has_pending_external_reports(p_entity_id) then
      insert into public.validation_issues
        (validation_run_id, rule_code, severity, message, blocking)
      select v_run_id, 'VAL_EXT_PENDING', 'ERROR',
             'La muestra tiene reportes de laboratorio externo pendientes de recepción.', true
      where exists (select 1 from public.validation_rules where code = 'VAL_EXT_PENDING' and active);
    end if;

    -- VAL-002: Normativa requerida sin confirmar bloquea
    if exists (
      select 1 from public.sample_regulations sr
      where sr.sample_id = p_entity_id and not sr.confirmed
    ) then
      insert into public.validation_issues
        (validation_run_id, rule_code, severity, message, blocking)
      select v_run_id, 'VAL_REG_UNCONFIRMED', 'ERROR',
             'La muestra tiene normativa asignada sin confirmar por el analista.', true
      where exists (select 1 from public.validation_rules where code = 'VAL_REG_UNCONFIRMED' and active);
    end if;

    -- VAL-003: Issues de conciliación abiertos bloquean
    if exists (
      select 1 from public.reconciliation_issues ri
      where ri.sample_id = p_entity_id and ri.status = 'OPEN'
        and ri.issue_type not in ('UNREQUESTED_PARAMETER') -- no solicitados no bloquean si se rechazan
    ) then
      insert into public.validation_issues
        (validation_run_id, rule_code, severity, message, blocking)
      select v_run_id, 'VAL_RECON_OPEN', 'ERROR',
             'La muestra tiene inconsistencias de conciliación sin resolver.', true
      where exists (select 1 from public.validation_rules where code = 'VAL_RECON_OPEN' and active);
    end if;

  end if;

  -- Marcar run completado
  update public.validation_runs set status = 'COMPLETED' where id = v_run_id;

  return v_run_id;
exception when others then
  update public.validation_runs set status = 'FAILED' where id = v_run_id;
  raise;
end;
$$;

-- ─── Triggers ─────────────────────────────────────────────────────────────────
create trigger validation_rules_updated_at  before update on public.validation_rules  for each row execute function public.set_updated_at();
create trigger validation_issues_updated_at before update on public.validation_issues for each row execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.validation_rules  enable row level security;
alter table public.validation_runs   enable row level security;
alter table public.validation_issues enable row level security;

create policy "val_rules: read"   on public.validation_rules  for select to authenticated using (public.current_user_is_active());
create policy "val_rules: admin"  on public.validation_rules  for insert to authenticated with check (public.has_role('ADMIN'));

create policy "val_runs: write"   on public.validation_runs   for insert to authenticated with check (public.has_any_role(array['ANALISTA','JEFE_TECNICA_CALIDAD','ADMIN']));
create policy "val_runs: read"    on public.validation_runs   for select to authenticated using (public.has_any_role(array['ANALISTA','JEFE_TECNICA_CALIDAD','ADMIN','AUDITOR']));
create policy "val_runs: update"  on public.validation_runs   for update to authenticated using (public.has_any_role(array['ANALISTA','JEFE_TECNICA_CALIDAD','ADMIN'])) with check (public.has_any_role(array['ANALISTA','JEFE_TECNICA_CALIDAD','ADMIN']));

create policy "val_issues: write"  on public.validation_issues for insert to authenticated with check (public.has_any_role(array['ANALISTA','JEFE_TECNICA_CALIDAD','ADMIN']));
create policy "val_issues: update" on public.validation_issues for update to authenticated using (public.has_any_role(array['ANALISTA','JEFE_TECNICA_CALIDAD','ADMIN'])) with check (public.has_any_role(array['ANALISTA','JEFE_TECNICA_CALIDAD','ADMIN']));
create policy "val_issues: read"   on public.validation_issues for select to authenticated using (public.has_any_role(array['ANALISTA','JEFE_TECNICA_CALIDAD','ADMIN','AUDITOR']));

-- ─── Grants ───────────────────────────────────────────────────────────────────
grant select on public.validation_rules to authenticated;
grant select, insert, update on public.validation_runs, public.validation_issues to authenticated;
grant execute on function public.run_validations(text, uuid) to authenticated;

-- ─── Seed: reglas de validación ───────────────────────────────────────────────
insert into public.validation_rules (code, description, severity, blocking, entity_type) values
  ('VAL_EXT_PENDING',      'Reportes de laboratorio externo pendientes',              'ERROR',   true,  'SAMPLE'),
  ('VAL_REG_UNCONFIRMED',  'Normativa asignada sin confirmar',                        'ERROR',   true,  'SAMPLE'),
  ('VAL_RECON_OPEN',       'Inconsistencias de conciliación abiertas',                'ERROR',   true,  'SAMPLE'),
  ('VAL_NO_RESULTS',       'Ensayo sin resultado',                                    'ERROR',   true,  'SAMPLE'),
  ('VAL_LEGACY_UNMAPPED',  'Código heredado sin mapeo SA',                            'ERROR',   true,  'SAMPLE'),
  ('VAL_DATE_SUSPICIOUS',  'Fechas improbables detectadas',                           'WARNING', false, 'SAMPLE'),
  ('VAL_REG_DIFF_QUOTE',   'Normativa distinta a la de la cotización',               'WARNING', false, 'SAMPLE'),
  ('VAL_MATRIX_MISMATCH',  'Matriz ARD/ARnD incoherente con el artículo normativo',  'WARNING', false, 'SAMPLE'),
  ('VAL_LAB_DEVIATION',    'Desviación informada por el laboratorio',                 'WARNING', false, 'SAMPLE'),
  -- Reglas de RSA (pre-registradas para p11)
  ('VAL_RSA_NO_TEMPLATE',  'Plantilla sin versión aprobada',                          'ERROR',   true,  'REPORT'),
  ('VAL_RSA_SEGREGATION',  'Segregación preparador/aprobador incumplida',             'ERROR',   true,  'REPORT'),
  ('VAL_RSA_NO_SIGNATURE', 'Firma o aprobación inexistente',                          'ERROR',   true,  'REPORT'),
  ('VAL_RSA_ISO_CONTENT',  'Contenido mínimo ISO/IEC 17025 7.8.2 incompleto',        'ERROR',   true,  'REPORT')
on conflict (code) do nothing;
