-- p08: Conciliación e inconsistencias

-- ─── Inconsistencias ──────────────────────────────────────────────────────────
create table public.reconciliation_issues (
  id          uuid    primary key default gen_random_uuid(),
  sample_id   uuid    not null,
  issue_type  text    not null check (issue_type in (
    'DATE_MISMATCH','MATRIX_MISMATCH','UNREQUESTED_PARAMETER',
    'MISSING_RESULT','LCM_MISMATCH','METHOD_MISMATCH','UNIT_MISMATCH',
    'TECHNIQUE_MISMATCH','DUPLICATE_RESULT','LAB_DEVIATION',
    'LEGACY_CODE_NO_MAPPING','INCOMPLETE_TEST_FIELDS'
  )),
  field_name  text,
  entity_type text,
  entity_id   uuid,
  source_a    text,
  value_a     text,
  source_b    text,
  value_b     text,
  status      text    not null default 'OPEN'
               check (status in ('OPEN','RESOLVED')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid    references public.profiles(id) on delete restrict,
  updated_by  uuid    references public.profiles(id) on delete restrict
);

-- ─── Decisiones de conciliación ───────────────────────────────────────────────
-- Req p08: motivo obligatorio en toda decisión
create table public.reconciliation_decisions (
  id              uuid    primary key default gen_random_uuid(),
  issue_id        uuid    not null references public.reconciliation_issues(id) on delete restrict,
  selected_source text,
  selected_value  text,
  decision        text    not null check (decision in ('ACCEPT_A','ACCEPT_B','MANUAL','REQUEST_REVIEW')),
  reason          text    not null check (btrim(reason) <> ''),
  decided_by      uuid    not null references public.profiles(id) on delete restrict,
  created_at      timestamptz not null default now()
);

-- ─── Trigger: cerrar issue al registrar decisión ──────────────────────────────
create or replace function public.close_issue_on_decision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.reconciliation_issues
  set status = 'RESOLVED', updated_at = now()
  where id = new.issue_id
    and new.decision in ('ACCEPT_A','ACCEPT_B','MANUAL');
  return new;
end;
$$;

create trigger reconciliation_decisions_close_issue
after insert on public.reconciliation_decisions
for each row execute function public.close_issue_on_decision();

-- ─── Triggers estándar ────────────────────────────────────────────────────────
create trigger reconciliation_issues_updated_at before update on public.reconciliation_issues for each row execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.reconciliation_issues    enable row level security;
alter table public.reconciliation_decisions enable row level security;

-- ANALISTA y ADMIN resuelven; JTC puede revisar y devolver; AUDITOR lee
create policy "recon_issues: write"  on public.reconciliation_issues for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN']));
create policy "recon_issues: update" on public.reconciliation_issues for update to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD'])) with check (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD']));
create policy "recon_issues: read"   on public.reconciliation_issues for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));

create policy "recon_decisions: write" on public.reconciliation_decisions for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD']));
create policy "recon_decisions: read"  on public.reconciliation_decisions for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));

-- ─── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update on public.reconciliation_issues to authenticated;
grant select, insert on public.reconciliation_decisions to authenticated;

-- ─── Datos DEMO para desarrollo (claramente marcados) ────────────────────────
-- Req p08: caso AG0346 con todos los tipos de inconsistencia
-- Se insertan SIN sample_id real (null) para evitar FK; deben eliminarse antes de prod
insert into public.reconciliation_issues (
  sample_id, issue_type, field_name, source_a, value_a, source_b, value_b, status
) values
  ('00000000-0000-0000-0000-000000000000', 'DATE_MISMATCH',         'sampling_date',    'Recepción',    '2026-05-29', 'Fuente externa',    '2026-05-26', 'OPEN'),
  ('00000000-0000-0000-0000-000000000000', 'MATRIX_MISMATCH',       'matrix',           'Recepción',    'ARnD',       'Fuente externa',    'ARD',        'OPEN'),
  ('00000000-0000-0000-0000-000000000000', 'DUPLICATE_RESULT',      'result',           'Importación 1','< 0,040',   'Importación 2',     '< 0,040',    'OPEN'),
  ('00000000-0000-0000-0000-000000000000', 'UNREQUESTED_PARAMETER', 'parameter',        'Fuente externa','Color',    null,                null,         'OPEN'),
  ('00000000-0000-0000-0000-000000000000', 'LEGACY_CODE_NO_MAPPING','test_code',        'AGQ/CHEM',     'AOX',       null,                null,         'OPEN'),
  ('00000000-0000-0000-0000-000000000000', 'INCOMPLETE_TEST_FIELDS','test_fields',      'Catálogo',     'AOX',       null,                null,         'OPEN')
on conflict do nothing;
