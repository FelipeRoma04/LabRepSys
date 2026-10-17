-- p09: Normativa y límites

-- ─── Normas ───────────────────────────────────────────────────────────────────
create table public.regulations (
  id               uuid    primary key default gen_random_uuid(),
  code             text    not null unique,
  name             text    not null,
  source_reference text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid    references public.profiles(id) on delete restrict,
  updated_by       uuid    references public.profiles(id) on delete restrict
);

-- ─── Versiones de norma ───────────────────────────────────────────────────────
create table public.regulation_versions (
  id              uuid    primary key default gen_random_uuid(),
  regulation_id   uuid    not null references public.regulations(id) on delete restrict,
  version_name    text    not null,
  valid_from      date,
  valid_until     date,
  status          text    not null default 'DRAFT'
                   check (status in ('DRAFT','ACTIVE','RETIRED')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid    references public.profiles(id) on delete restrict,
  updated_by      uuid    references public.profiles(id) on delete restrict,
  check (valid_from is null or valid_until is null or valid_until >= valid_from)
);

-- ─── Actividades por artículo ─────────────────────────────────────────────────
create table public.regulation_activities (
  id                    uuid    primary key default gen_random_uuid(),
  regulation_version_id uuid    not null references public.regulation_versions(id) on delete restrict,
  article               text    not null,
  activity              text    not null,
  discharge_type        text    check (discharge_type in ('ARD','ARnD','NA')),
  description           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid    references public.profiles(id) on delete restrict,
  updated_by            uuid    references public.profiles(id) on delete restrict
);

-- ─── Límites por ensayo ───────────────────────────────────────────────────────
-- Req p09: valores especiales no son 0 ni vacío
create table public.regulation_limits (
  id              uuid    primary key default gen_random_uuid(),
  activity_id     uuid    not null references public.regulation_activities(id) on delete restrict,
  test_id         uuid    not null references public.tests(id) on delete restrict,
  limit_operator  text    check (limit_operator in ('<','<=','>','>=','=')),
  limit_value     numeric,
  limit_text      text,   -- texto del límite tal como aparece en la norma
  unit            text,
  -- Valores especiales del p09
  special_value   text    check (special_value in ('N_A','N_E','N_R','NOT_SPECIFIED','ANALYSIS_AND_REPORT','NONE')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid    references public.profiles(id) on delete restrict,
  updated_by      uuid    references public.profiles(id) on delete restrict
);

-- ─── Normativa aplicada a muestras ───────────────────────────────────────────
-- Req p09: confirmación humana obligatoria; sugerencia desde cotización
create table public.sample_regulations (
  id                      uuid    primary key default gen_random_uuid(),
  sample_id               uuid    not null,
  regulation_version_id   uuid    not null references public.regulation_versions(id) on delete restrict,
  activity_id             uuid    references public.regulation_activities(id) on delete restrict,
  source                  text    not null check (source in ('QUOTE','MANUAL')),
  suggested_from_quote_id uuid,
  confirmed               boolean not null default false,
  confirmed_by            uuid    references public.profiles(id) on delete restrict,
  confirmed_at            timestamptz,
  column_order            integer not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid    references public.profiles(id) on delete restrict,
  updated_by              uuid    references public.profiles(id) on delete restrict,
  unique (sample_id, regulation_version_id, column_order)
);

-- ─── Triggers ─────────────────────────────────────────────────────────────────
create trigger regulations_updated_at          before update on public.regulations            for each row execute function public.set_updated_at();
create trigger regulation_versions_updated_at  before update on public.regulation_versions    for each row execute function public.set_updated_at();
create trigger regulation_activities_updated_at before update on public.regulation_activities for each row execute function public.set_updated_at();
create trigger regulation_limits_updated_at    before update on public.regulation_limits      for each row execute function public.set_updated_at();
create trigger sample_regulations_updated_at   before update on public.sample_regulations     for each row execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.regulations             enable row level security;
alter table public.regulation_versions     enable row level security;
alter table public.regulation_activities   enable row level security;
alter table public.regulation_limits       enable row level security;
alter table public.sample_regulations      enable row level security;

-- Normativa: ADMIN administra; todos los activos leen
create policy "regulations: read"         on public.regulations           for select to authenticated using (public.current_user_is_active());
create policy "regulations: admin write"  on public.regulations           for insert to authenticated with check (public.has_role('ADMIN'));
create policy "regulations: admin update" on public.regulations           for update to authenticated using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

create policy "reg_versions: read"        on public.regulation_versions   for select to authenticated using (public.current_user_is_active());
create policy "reg_versions: admin write" on public.regulation_versions   for insert to authenticated with check (public.has_role('ADMIN'));
create policy "reg_versions: admin update" on public.regulation_versions  for update to authenticated using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

create policy "reg_activities: read"      on public.regulation_activities for select to authenticated using (public.current_user_is_active());
create policy "reg_activities: write"     on public.regulation_activities for insert to authenticated with check (public.has_role('ADMIN'));
create policy "reg_activities: update"    on public.regulation_activities for update to authenticated using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

create policy "reg_limits: read"          on public.regulation_limits     for select to authenticated using (public.current_user_is_active());
create policy "reg_limits: write"         on public.regulation_limits     for insert to authenticated with check (public.has_role('ADMIN'));
create policy "reg_limits: update"        on public.regulation_limits     for update to authenticated using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

-- sample_regulations: ANALISTA confirma; todos activos leen
create policy "sample_regs: read"   on public.sample_regulations for select to authenticated using (public.current_user_is_active());
create policy "sample_regs: write"  on public.sample_regulations for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN']));
create policy "sample_regs: update" on public.sample_regulations for update to authenticated using (public.has_any_role(array['ANALISTA','ADMIN'])) with check (public.has_any_role(array['ANALISTA','ADMIN']));

-- ─── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update on public.regulations, public.regulation_versions, public.regulation_activities, public.regulation_limits, public.sample_regulations to authenticated;

-- ─── Estructura inicial: Resolución 631 de 2015 ──────────────────────────────
-- Req p09: solo estructura — NO inventar límites. Se cargan por importación CSV.
insert into public.regulations (code, name, source_reference)
values ('RES_631_2015', 'Resolución 631 de 2015', 'Ministerio de Ambiente y Desarrollo Sostenible - MADS')
on conflict (code) do nothing;
