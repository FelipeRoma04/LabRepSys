-- p06: Laboratorios subcontratados — envíos y reportes pendientes

-- ─── Envíos externos ──────────────────────────────────────────────────────────
create table public.external_shipments (
  id                  uuid    primary key default gen_random_uuid(),
  sample_id           uuid    not null,            -- FK a samples (p04)
  laboratory_id       uuid    not null references public.laboratories(id) on delete restrict,
  external_code       text,                        -- código del laboratorio externo
  sent_at             timestamptz,
  expected_at         timestamptz,                 -- ingresada manualmente; DP-014 no se calcula
  report_received_at  timestamptz,
  received_by         uuid    references public.profiles(id) on delete restrict,
  status              text    not null default 'PENDING_SEND'
                       check (status in ('PENDING_SEND','SENT','REPORT_RECEIVED','CANCELLED')),
  observations        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid    references public.profiles(id) on delete restrict,
  updated_by          uuid    references public.profiles(id) on delete restrict
);

-- ─── Ensayos por envío ────────────────────────────────────────────────────────
-- Regla: un sample_test subcontratado en exactamente un envío activo
create table public.external_shipment_tests (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.external_shipments(id) on delete restrict,
  sample_test_id uuid not null,                    -- FK a sample_tests (p04)
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete restrict,
  -- Un mismo sample_test no puede estar en dos envíos activos al mismo tiempo
  unique (sample_test_id)
);

-- ─── Vista: reportes externos pendientes ─────────────────────────────────────
-- Req p06: "Pendiente" = status distinto de REPORT_RECEIVED y CANCELLED
-- security_invoker para respetar RLS del usuario consultante
create or replace view public.v_pending_external_reports
with (security_invoker = true)
as
select
  es.id           as shipment_id,
  es.sample_id,
  es.laboratory_id,
  l.name          as laboratory_name,
  es.external_code,
  es.sent_at,
  es.expected_at,
  es.status,
  -- Días de retraso calculados con la fecha actual
  case
    when es.expected_at is not null and es.status not in ('REPORT_RECEIVED','CANCELLED')
    then greatest(0, extract(day from now() - es.expected_at)::int)
    else null
  end             as days_overdue,
  es.observations
from public.external_shipments es
join public.laboratories l on l.id = es.laboratory_id
where es.status not in ('REPORT_RECEIVED', 'CANCELLED');

-- ─── Función helper: ¿tiene la muestra reportes externos pendientes? ──────────
-- Usada por motor de validaciones y RSA (p10, p11)
create or replace function public.sample_has_pending_external_reports(
  p_sample_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.external_shipments es
    where es.sample_id = p_sample_id
      and es.status not in ('REPORT_RECEIVED', 'CANCELLED')
  );
$$;

-- ─── Triggers ─────────────────────────────────────────────────────────────────
create trigger external_shipments_updated_at      before update on public.external_shipments      for each row execute function public.set_updated_at();
create trigger external_shipment_tests_updated_at before update on public.external_shipment_tests for each row execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.external_shipments      enable row level security;
alter table public.external_shipment_tests enable row level security;

-- external_shipments: RECEPCION, ANALISTA, ADMIN gestionan; JTC y AUDITOR leen
create policy "ext_shipments: write"  on public.external_shipments for insert to authenticated with check (public.has_any_role(array['RECEPCION','ANALISTA','ADMIN']));
create policy "ext_shipments: update" on public.external_shipments for update to authenticated using (public.has_any_role(array['RECEPCION','ANALISTA','ADMIN'])) with check (public.has_any_role(array['RECEPCION','ANALISTA','ADMIN']));
create policy "ext_shipments: read"   on public.external_shipments for select to authenticated using (public.has_any_role(array['RECEPCION','ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));

create policy "ext_shipment_tests: write" on public.external_shipment_tests for insert to authenticated with check (public.has_any_role(array['RECEPCION','ANALISTA','ADMIN']));
create policy "ext_shipment_tests: read"  on public.external_shipment_tests for select to authenticated using (public.has_any_role(array['RECEPCION','ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));

-- ─── Permisos ─────────────────────────────────────────────────────────────────
grant select, insert, update on public.external_shipments, public.external_shipment_tests to authenticated;
grant select on public.v_pending_external_reports to authenticated;
grant execute on function public.sample_has_pending_external_reports(uuid) to authenticated;
