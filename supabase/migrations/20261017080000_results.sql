-- p07: Importación de resultados y resultados de laboratorio

-- ─── Importaciones ────────────────────────────────────────────────────────────
create table public.result_imports (
  id              uuid    primary key default gen_random_uuid(),
  sample_id       uuid    not null,
  laboratory_id   uuid    not null references public.laboratories(id) on delete restrict,
  source_type     text    not null check (source_type in ('PDF','PASTE','MANUAL')),
  storage_path    text,
  file_name       text,
  file_hash       text,
  adapter_code    text,
  adapter_version text,
  import_status   text    not null default 'PENDING'
                   check (import_status in ('PENDING','PROCESSING','PARTIAL','COMPLETED','FAILED')),
  raw_payload     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid    references public.profiles(id) on delete restrict,
  updated_by      uuid    references public.profiles(id) on delete restrict,
  -- Idempotencia: mismo archivo para misma muestra+laboratorio no se duplica
  unique nulls not distinct (sample_id, laboratory_id, file_hash)
);

-- ─── Filas de importación (mapeo de parámetros externos) ──────────────────────
create table public.import_rows (
  id                  uuid    primary key default gen_random_uuid(),
  result_import_id    uuid    not null references public.result_imports(id) on delete restrict,
  row_number          integer not null,
  external_parameter  text,
  external_unit       text,
  external_result     text,   -- texto original preservado
  mapped_test_id      uuid    references public.tests(id) on delete restrict,
  mapping_status      text    not null default 'UNMAPPED'
                       check (mapping_status in ('EXACT','SUGGESTED','UNMAPPED','CONFIRMED')),
  validation_messages jsonb,
  confirmed           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid    references public.profiles(id) on delete restrict,
  updated_by          uuid    references public.profiles(id) on delete restrict
);

-- ─── Resultados ───────────────────────────────────────────────────────────────
-- Req p07: original_text NUNCA se sobrescribe; la corrección va en result_corrections
create table public.results (
  id                  uuid    primary key default gen_random_uuid(),
  sample_id           uuid    not null,
  test_id             uuid    not null references public.tests(id) on delete restrict,
  laboratory_id       uuid    not null references public.laboratories(id) on delete restrict,
  -- Resultado: operador + valor numérico + texto original preservado
  operator            text    check (operator in ('<','<=','>','>=','=')),
  numeric_value       numeric,
  original_text       text,   -- siempre preservado tal como vino
  reported_text       text,   -- texto compuesto para mostrar
  unit                text,
  lcm                 numeric,
  uncertainty_text    text,   -- tal como se recibió; sin normalización (DP-008)
  method_text         text,
  technique_text      text,
  accreditation_type  text    check (accreditation_type in ('ACCREDITED','NOT_ACCREDITED','NOT_APPLICABLE')),
  analysis_start      timestamptz,
  analysis_end        timestamptz,
  source_import_id    uuid    references public.result_imports(id) on delete restrict,
  source_page         integer,
  entry_mechanism     text    not null check (entry_mechanism in ('IMPORTED','PASTE','MANUAL')),
  status              text    not null default 'IMPORTED'
                       check (status in ('IMPORTED','CONFIRMED','CORRECTED','REJECTED')),
  entered_by          uuid    not null references public.profiles(id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid    references public.profiles(id) on delete restrict,
  updated_by          uuid    references public.profiles(id) on delete restrict
);

-- ─── Correcciones de resultados ───────────────────────────────────────────────
-- Req p07: motivo obligatorio; el dato original queda en old_data
create table public.result_corrections (
  id            uuid    primary key default gen_random_uuid(),
  result_id     uuid    not null references public.results(id) on delete restrict,
  old_data      jsonb   not null,
  new_data      jsonb   not null,
  reason        text    not null check (btrim(reason) <> ''),
  corrected_by  uuid    not null references public.profiles(id) on delete restrict,
  created_at    timestamptz not null default now()
);

-- ─── Triggers ─────────────────────────────────────────────────────────────────
create trigger result_imports_updated_at    before update on public.result_imports    for each row execute function public.set_updated_at();
create trigger import_rows_updated_at       before update on public.import_rows       for each row execute function public.set_updated_at();
create trigger results_updated_at           before update on public.results           for each row execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.result_imports    enable row level security;
alter table public.import_rows       enable row level security;
alter table public.results           enable row level security;
alter table public.result_corrections enable row level security;

-- ANALISTA y ADMIN escriben; JTC y AUDITOR leen
create policy "result_imports: write"  on public.result_imports for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN']));
create policy "result_imports: update" on public.result_imports for update to authenticated using (public.has_any_role(array['ANALISTA','ADMIN'])) with check (public.has_any_role(array['ANALISTA','ADMIN']));
create policy "result_imports: read"   on public.result_imports for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));

create policy "import_rows: write"  on public.import_rows for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN']));
create policy "import_rows: update" on public.import_rows for update to authenticated using (public.has_any_role(array['ANALISTA','ADMIN'])) with check (public.has_any_role(array['ANALISTA','ADMIN']));
create policy "import_rows: read"   on public.import_rows for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));

create policy "results: write"  on public.results for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN']));
create policy "results: update" on public.results for update to authenticated using (public.has_any_role(array['ANALISTA','ADMIN'])) with check (public.has_any_role(array['ANALISTA','ADMIN']));
create policy "results: read"   on public.results for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));

create policy "result_corrections: write" on public.result_corrections for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN']));
create policy "result_corrections: read"  on public.result_corrections for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));

-- ─── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update on public.result_imports, public.import_rows, public.results to authenticated;
grant select, insert on public.result_corrections to authenticated;
