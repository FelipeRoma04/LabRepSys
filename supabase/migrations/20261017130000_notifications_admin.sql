-- p13: Notificaciones internas y decisiones pendientes (DP-xxx)

-- ─── Notificaciones ───────────────────────────────────────────────────────────
create table public.notifications (
  id          uuid    primary key default gen_random_uuid(),
  user_id     uuid    not null references public.profiles(id) on delete restrict,
  type        text    not null,   -- ASSIGNED, RETURNED, APPROVED, VALIDATION_ERROR, EXTERNAL_OVERDUE
  entity_type text,
  entity_id   uuid,
  message     text    not null,
  read_at     timestamptz,        -- null = no leída
  created_at  timestamptz not null default now()
);

-- ─── Decisiones pendientes (tabla DP) ────────────────────────────────────────
create table public.pending_decisions (
  id               uuid    primary key default gen_random_uuid(),
  code             text    not null unique,  -- DP-001, DP-002 ...
  topic            text    not null,
  decision_required text   not null,
  suggested_owner  text,
  priority         text    not null default 'MEDIUM' check (priority in ('HIGH','MEDIUM','LOW')),
  status           text    not null default 'PENDIENTE'
                    check (status in ('PENDIENTE','DEFINIDA','DESCARTADA','FUERA_DE_MVP')),
  decision_text    text,
  decided_by       uuid    references public.profiles(id) on delete restrict,
  decided_at       timestamptz,
  evidence         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid    references public.profiles(id) on delete restrict,
  updated_by       uuid    references public.profiles(id) on delete restrict
);

-- ─── Triggers ─────────────────────────────────────────────────────────────────
create trigger notifications_no_update before update on public.notifications
for each row execute function public.set_updated_at();

create trigger pending_decisions_updated_at before update on public.pending_decisions
for each row execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.notifications    enable row level security;
alter table public.pending_decisions enable row level security;

-- Notificaciones: cada usuario ve solo las suyas
create policy "notifications: own read"   on public.notifications for select to authenticated using (user_id = auth.uid() and public.current_user_is_active());
create policy "notifications: insert"     on public.notifications for insert to authenticated with check (public.current_user_is_active());
create policy "notifications: own update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Decisiones pendientes: ADMIN y JTC administran; todos activos leen
create policy "pending_decisions: read"   on public.pending_decisions for select to authenticated using (public.current_user_is_active());
create policy "pending_decisions: write"  on public.pending_decisions for insert to authenticated with check (public.has_any_role(array['ADMIN','JEFE_TECNICA_CALIDAD']));
create policy "pending_decisions: update" on public.pending_decisions for update to authenticated using (public.has_any_role(array['ADMIN','JEFE_TECNICA_CALIDAD'])) with check (public.has_any_role(array['ADMIN','JEFE_TECNICA_CALIDAD']));

-- ─── Grants ───────────────────────────────────────────────────────────────────
grant select, insert, update on public.notifications to authenticated;
grant select, insert, update on public.pending_decisions to authenticated;

-- ─── Seed: tabla de decisiones pendientes DP-001 a DP-033 ───────────────────
insert into public.pending_decisions (code, topic, decision_required, suggested_owner, priority, status) values
  ('DP-001', 'Versión oficial de plantilla RSA',                   'Determinar la versión vigente aprobada por Calidad',               'Jefe Técnica y Calidad', 'HIGH',   'PENDIENTE'),
  ('DP-002', 'Contador anual y reserva de consecutivos',           'Definir si el contador RSA se reinicia cada año y cuándo',         'Administrador',          'HIGH',   'PENDIENTE'),
  ('DP-003', 'Agrupación de muestras en un RSA',                   'Reglas para agrupar varias muestras en un solo reporte',           'Jefe Técnica y Calidad', 'MEDIUM', 'PENDIENTE'),
  ('DP-007', 'Declaración de conformidad y regla de decisión',     'Definir si se declara conformidad automática vs límite',           'Calidad / Legal',        'HIGH',   'PENDIENTE'),
  ('DP-008', 'Cálculo y normalización de incertidumbre',           'Fórmula aprobada para reportar incertidumbre expandida',           'Jefe Técnica y Calidad', 'HIGH',   'PENDIENTE'),
  ('DP-009', 'Sumatorias BTEX y HAP',                             'Regla de cálculo y presentación de sumatorias',                    'Jefe Técnica y Calidad', 'MEDIUM', 'PENDIENTE'),
  ('DP-010', 'Redondeo y cifras significativas',                   'Política de redondeo para resultados reportados',                  'Jefe Técnica y Calidad', 'HIGH',   'PENDIENTE'),
  ('DP-012', 'Firma electrónica o digital',                        'Mecanismo de firma a usar en RSA (imagen vs digital)',             'Legal / TI',             'HIGH',   'PENDIENTE'),
  ('DP-013', 'Suplentes de aprobación',                           'Lista de personas habilitadas como suplentes de la JTC',           'Jefe Técnica y Calidad', 'HIGH',   'PENDIENTE'),
  ('DP-014', 'Plazos y días hábiles',                             'Definir cómo calcular plazos de entrega (festivos incluidos)',     'Calidad',                'MEDIUM', 'PENDIENTE'),
  ('DP-016', 'RPO/RTO de respaldo',                               'Definir objetivos de punto y tiempo de recuperación',             'TI / Dirección',         'HIGH',   'PENDIENTE'),
  ('DP-022', 'Librería de generación de PDF en servidor',          'Seleccionar librería (pdf-lib, pdfmake) con licencia aprobada',   'TI',                     'MEDIUM', 'PENDIENTE'),
  ('DP-023', 'OCR de PDF escaneados',                             'Definir si se implementa OCR o solo captura manual',              'TI / Calidad',           'LOW',    'FUERA_DE_MVP'),
  ('DP-024', 'Integración con Microsoft Graph / SharePoint',       'Alcance y autenticación de la integración',                       'TI',                     'LOW',    'FUERA_DE_MVP'),
  ('DP-026', 'Datos de campo sin conexión (offline)',             'Alcance del modo offline para trabajo en campo',                   'TI / Muestreo',          'LOW',    'FUERA_DE_MVP'),
  ('DP-027', 'Notificaciones por correo o Teams',                  'Canal y proveedor para notificaciones externas',                   'TI',                     'MEDIUM', 'PENDIENTE'),
  ('DP-031', 'Emisión parcial con subcontratados pendientes',      'Definir si se permite emitir con resultados parciales',           'Calidad / Legal',        'HIGH',   'PENDIENTE'),
  ('DP-033', 'Informe técnico INF (fuera de MVP)',                 'Alcance y formato del informe técnico complementario',            'Jefe Técnica y Calidad', 'LOW',    'FUERA_DE_MVP')
on conflict (code) do nothing;
