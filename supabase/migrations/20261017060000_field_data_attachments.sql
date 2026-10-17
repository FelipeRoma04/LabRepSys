-- p05: Datos de campo y adjuntos de muestras
-- Depende de: samples (p03/p04 de Copilot — usa skip con guard en tests)

-- ─── Catálogo de parámetros de campo ──────────────────────────────────────────
create table public.field_parameters (
  id          uuid    primary key default gen_random_uuid(),
  code        text    not null unique,
  name        text    not null,
  default_unit text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete restrict,
  updated_by  uuid references public.profiles(id) on delete restrict
);

-- ─── Datos de campo por muestra ───────────────────────────────────────────────
-- Req p05: guardar siempre el texto original de coordenadas
create table public.sample_field_data (
  id                    uuid    primary key default gen_random_uuid(),
  sample_id             uuid    not null unique, -- FK a samples cuando exista
  latitude_original     text,
  longitude_original    text,
  latitude_normalized   numeric,
  longitude_normalized  numeric,
  coordinate_state      text    check (coordinate_state in ('NORMALIZED','AMBIGUOUS','INVALID','PENDING')),
  collected_by          uuid    references public.profiles(id) on delete restrict,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid    references public.profiles(id) on delete restrict,
  updated_by            uuid    references public.profiles(id) on delete restrict,
  -- Validar rangos de coordenadas solo cuando están normalizadas
  check (latitude_normalized  is null or (latitude_normalized  between -90  and  90)),
  check (longitude_normalized is null or (longitude_normalized between -180 and 180))
);

-- ─── Mediciones de campo ──────────────────────────────────────────────────────
-- Req p05: CHECK crítico — numeric_value NOT NULL solo si value_state = 'VALUE'
-- Un cero con VALUE es distinto de "sin dato". Nunca usar 0 para ausencia.
create table public.sample_field_measurements (
  id                  uuid    primary key default gen_random_uuid(),
  sample_id           uuid    not null,
  field_parameter_id  uuid    not null references public.field_parameters(id) on delete restrict,
  value_state         text    not null check (value_state in ('VALUE','NOT_APPLICABLE','NOT_REPORTED','NOT_SPECIFIED','PENDING')),
  numeric_value       numeric,
  unit                text,
  original_text       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid    references public.profiles(id) on delete restrict,
  updated_by          uuid    references public.profiles(id) on delete restrict,
  -- numeric_value debe ser NOT NULL si y solo si value_state = 'VALUE'
  check (
    (value_state = 'VALUE'  and numeric_value is not null) or
    (value_state <> 'VALUE' and numeric_value is null)
  )
);

-- ─── Adjuntos ─────────────────────────────────────────────────────────────────
create table public.sample_attachments (
  id              uuid    primary key default gen_random_uuid(),
  sample_id       uuid    not null,
  attachment_type text    not null check (attachment_type in ('SOLICITUD','CADENA_CUSTODIA','FORMATO_CAMPO','FOTO','OTRO')),
  storage_path    text    not null,
  file_name       text    not null,
  file_type       text    not null check (file_type in ('pdf','jpg','jpeg','png','csv','xlsx')),
  file_size       bigint  not null check (file_size > 0),
  sha256          text    not null,
  uploaded_by     uuid    not null references public.profiles(id) on delete restrict,
  withdrawn       boolean not null default false,
  withdrawn_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid    references public.profiles(id) on delete restrict,
  updated_by      uuid    references public.profiles(id) on delete restrict,
  -- Si está retirado debe tener motivo
  check (not withdrawn or withdrawn_reason is not null)
);

-- ─── Triggers estándar ────────────────────────────────────────────────────────
create trigger field_parameters_updated_at     before update on public.field_parameters      for each row execute function public.set_updated_at();
create trigger sample_field_data_updated_at    before update on public.sample_field_data     for each row execute function public.set_updated_at();
create trigger sample_measurements_updated_at  before update on public.sample_field_measurements for each row execute function public.set_updated_at();
create trigger sample_attachments_updated_at   before update on public.sample_attachments    for each row execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.field_parameters          enable row level security;
alter table public.sample_field_data         enable row level security;
alter table public.sample_field_measurements enable row level security;
alter table public.sample_attachments        enable row level security;

-- field_parameters: lectura todos activos; escritura ADMIN
create policy "field_parameters: select active"    on public.field_parameters for select to authenticated using (active and public.current_user_is_active());
create policy "field_parameters: admin select all" on public.field_parameters for select to authenticated using (public.has_role('ADMIN'));
create policy "field_parameters: admin write"      on public.field_parameters for insert to authenticated with check (public.has_role('ADMIN'));
create policy "field_parameters: admin update"     on public.field_parameters for update to authenticated using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

-- sample_field_data: MUESTREO, RECEPCION, ADMIN gestionan; analistas y auditores leen
create policy "sample_field_data: write"  on public.sample_field_data for insert to authenticated with check (public.has_any_role(array['MUESTREO','RECEPCION','ADMIN']));
create policy "sample_field_data: update" on public.sample_field_data for update to authenticated using (public.has_any_role(array['MUESTREO','RECEPCION','ADMIN'])) with check (public.has_any_role(array['MUESTREO','RECEPCION','ADMIN']));
create policy "sample_field_data: read"   on public.sample_field_data for select to authenticated using (public.has_any_role(array['MUESTREO','RECEPCION','ADMIN','ANALISTA','JEFE_TECNICA_CALIDAD','AUDITOR']));

-- sample_field_measurements: mismos que field_data
create policy "sample_measurements: write"  on public.sample_field_measurements for insert to authenticated with check (public.has_any_role(array['MUESTREO','RECEPCION','ADMIN']));
create policy "sample_measurements: update" on public.sample_field_measurements for update to authenticated using (public.has_any_role(array['MUESTREO','RECEPCION','ADMIN'])) with check (public.has_any_role(array['MUESTREO','RECEPCION','ADMIN']));
create policy "sample_measurements: read"   on public.sample_field_measurements for select to authenticated using (public.has_any_role(array['MUESTREO','RECEPCION','ADMIN','ANALISTA','JEFE_TECNICA_CALIDAD','AUDITOR']));

-- sample_attachments: RECEPCION y ADMIN gestionan; los demás leen
create policy "sample_attachments: write"  on public.sample_attachments for insert to authenticated with check (public.has_any_role(array['RECEPCION','ADMIN']));
create policy "sample_attachments: update" on public.sample_attachments for update to authenticated using (public.has_any_role(array['RECEPCION','ADMIN'])) with check (public.has_any_role(array['RECEPCION','ADMIN']));
create policy "sample_attachments: read"   on public.sample_attachments for select to authenticated using (public.has_any_role(array['RECEPCION','ADMIN','MUESTREO','ANALISTA','JEFE_TECNICA_CALIDAD','AUDITOR']));

-- ─── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update on public.field_parameters, public.sample_field_data, public.sample_field_measurements, public.sample_attachments to authenticated;

-- ─── Seed: parámetros de campo estándar ───────────────────────────────────────
insert into public.field_parameters (code, name, default_unit) values
  ('ph',                'pH',                         'Unidades pH'),
  ('conductivity',      'Conductividad',               'µS/cm'),
  ('temperature',       'Temperatura',                 '°C'),
  ('dissolved_oxygen',  'Oxígeno disuelto',            'mg/L'),
  ('flow_rate',         'Caudal',                      'm³/s'),
  ('ssed',              'Sólidos sedimentables',       'mL/L')
on conflict (code) do nothing;
