-- p11: Reportes RSA — constructor, revisión, aprobación, segregación
-- p12: Emisión, snapshot, inmutabilidad, rectificación

-- ─── Suplentes de aprobación ─────────────────────────────────────────────────
-- SIN seed: no inventar personas (DP-013)
create table public.approval_deputies (
  id          uuid    primary key default gen_random_uuid(),
  user_id     uuid    not null references public.profiles(id) on delete restrict,
  active      boolean not null default true,
  valid_from  date    not null,
  valid_until date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid    references public.profiles(id) on delete restrict,
  updated_by  uuid    references public.profiles(id) on delete restrict,
  check (valid_until is null or valid_until >= valid_from)
);

-- ─── Reportes RSA ────────────────────────────────────────────────────────────
create table public.reports (
  id                  uuid    primary key default gen_random_uuid(),
  code                text,   -- asignado al emitir con next_counter
  version             integer not null default 1 check (version > 0),
  status              text    not null default 'DRAFT'
                       check (status in (
                         'DRAFT','VALIDATING','READY_FOR_REVIEW','IN_REVIEW',
                         'RETURNED','APPROVED','ISSUED','RECTIFIED','VOIDED'
                       )),
  client_id           uuid,   -- FK a clients (p03)
  contact_id          uuid,   -- FK a contacts (p03)
  template_id         uuid    references public.report_templates(id) on delete restrict,
  prepared_by         uuid    not null references public.profiles(id) on delete restrict,
  reviewed_by         uuid    references public.profiles(id) on delete restrict,
  approved_by         uuid    references public.profiles(id) on delete restrict,
  issued_at           timestamptz,
  replaces_report_id  uuid    references public.reports(id) on delete restrict,
  rectification_reason text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid    references public.profiles(id) on delete restrict,
  updated_by          uuid    references public.profiles(id) on delete restrict
);

-- ─── Muestras del reporte ────────────────────────────────────────────────────
create table public.report_samples (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports(id) on delete restrict,
  sample_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (report_id, sample_id)
);

-- ─── Resultados del reporte ───────────────────────────────────────────────────
create table public.report_results (
  id            uuid    primary key default gen_random_uuid(),
  report_id     uuid    not null references public.reports(id) on delete restrict,
  result_id     uuid    not null references public.results(id) on delete restrict,
  display_order integer not null default 0,
  group_label   text,
  created_at    timestamptz not null default now(),
  unique (report_id, result_id)
);

-- ─── Columnas normativas del reporte ──────────────────────────────────────────
create table public.report_regulation_columns (
  id                    uuid    primary key default gen_random_uuid(),
  report_id             uuid    not null references public.reports(id) on delete restrict,
  sample_regulation_id  uuid    not null references public.sample_regulations(id) on delete restrict,
  column_order          integer not null default 1,
  created_at            timestamptz not null default now(),
  unique (report_id, sample_regulation_id)
);

-- ─── Revisiones ───────────────────────────────────────────────────────────────
create table public.report_reviews (
  id          uuid    primary key default gen_random_uuid(),
  report_id   uuid    not null references public.reports(id) on delete restrict,
  reviewer_id uuid    not null references public.profiles(id) on delete restrict,
  decision    text    not null check (decision in ('ACCEPTED','RETURNED','APPROVED')),
  comments    text,
  created_at  timestamptz not null default now()
);

-- ─── Aprobaciones ─────────────────────────────────────────────────────────────
create table public.report_approvals (
  id                   uuid    primary key default gen_random_uuid(),
  report_id            uuid    not null references public.reports(id) on delete restrict,
  approver_id          uuid    not null references public.profiles(id) on delete restrict,
  decision             text    not null check (decision in ('APPROVED','REJECTED')),
  signature_reference  text,
  created_at           timestamptz not null default now()
);

-- ─── Comentarios ──────────────────────────────────────────────────────────────
create table public.report_comments (
  id          uuid    primary key default gen_random_uuid(),
  report_id   uuid    not null references public.reports(id) on delete restrict,
  entity_type text    not null check (entity_type in ('REPORT','RESULT','FIELD')),
  entity_id   uuid,
  comment     text    not null,
  resolved    boolean not null default false,
  created_by  uuid    not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Snapshots de emisión ────────────────────────────────────────────────────
create table public.report_snapshots (
  id            uuid    primary key default gen_random_uuid(),
  report_id     uuid    not null unique references public.reports(id) on delete restrict,
  snapshot_data jsonb   not null,
  snapshot_hash text    not null,
  created_at    timestamptz not null default now()
);

-- ─── Archivos PDF ─────────────────────────────────────────────────────────────
create table public.report_files (
  id           uuid    primary key default gen_random_uuid(),
  report_id    uuid    not null references public.reports(id) on delete restrict,
  file_type    text    not null check (file_type in ('DRAFT_PDF','FINAL_PDF')),
  storage_path text    not null,
  sha256       text    not null,
  created_at   timestamptz not null default now(),
  created_by   uuid    references public.profiles(id) on delete restrict
);

-- ─── Tabla de transiciones válidas ───────────────────────────────────────────
create table public.report_status_transitions (
  from_status text not null,
  to_status   text not null,
  primary key (from_status, to_status)
);

insert into public.report_status_transitions values
  ('DRAFT',            'VALIDATING'),
  ('VALIDATING',       'READY_FOR_REVIEW'),
  ('VALIDATING',       'DRAFT'),
  ('READY_FOR_REVIEW', 'IN_REVIEW'),
  ('IN_REVIEW',        'RETURNED'),
  ('IN_REVIEW',        'APPROVED'),
  ('RETURNED',         'READY_FOR_REVIEW'),
  ('APPROVED',         'ISSUED'),
  ('ISSUED',           'RECTIFIED'),
  ('ISSUED',           'VOIDED');

-- ─── Trigger: bloquear UPDATE directo de status en reports ───────────────────
create or replace function public.prevent_direct_report_status_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.status is distinct from new.status then
    raise exception using
      errcode = '42501',
      message = 'El estado del reporte solo puede cambiarse mediante transition_report o issue_report.';
  end if;
  return new;
end;
$$;

create trigger reports_prevent_status_update
before update of status on public.reports
for each row execute function public.prevent_direct_report_status_update();

-- ─── Inmutabilidad de reportes emitidos ──────────────────────────────────────
create or replace function public.prevent_issued_report_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare v_status text;
begin
  select status into v_status from public.reports where id = coalesce(new.report_id, old.report_id);
  if v_status = 'ISSUED' then
    raise exception using
      errcode = '42501',
      message = 'Las tablas relacionadas a un reporte ISSUED son inmutables.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger report_samples_immutable
before insert or update or delete on public.report_samples
for each row execute function public.prevent_issued_report_mutation();

create trigger report_results_immutable
before insert or update or delete on public.report_results
for each row execute function public.prevent_issued_report_mutation();

-- ─── RPC: transition_report ───────────────────────────────────────────────────
create or replace function public.transition_report(
  p_report_id uuid,
  p_to_status text,
  p_comment   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_report  public.reports%rowtype;
  v_allowed boolean;
begin
  select * into v_report from public.reports where id = p_report_id;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND', 'message', 'Reporte no encontrado.');
  end if;

  -- Verificar transición válida
  select exists(
    select 1 from public.report_status_transitions
    where from_status = v_report.status and to_status = p_to_status
  ) into v_allowed;

  if not v_allowed then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVALID_TRANSITION',
      'message', format('Transición %s → %s no permitida.', v_report.status, p_to_status)
    );
  end if;

  -- Verificar rol
  if p_to_status in ('IN_REVIEW','RETURNED','APPROVED') then
    if not public.has_role('JEFE_TECNICA_CALIDAD') then
      perform public.log_audit('TRANSITION_REPORT_DENIED','REPORT', p_report_id, null,
        jsonb_build_object('to_status', p_to_status, 'reason', 'rol insuficiente'));
      return jsonb_build_object(
        'ok', false, 'error_code', 'INSUFFICIENT_ROLE',
        'message', 'Solo JEFE_TECNICA_CALIDAD puede mover a este estado.'
      );
    end if;
  end if;

  -- Segregación: quien preparó no puede aprobar
  if p_to_status = 'APPROVED' then
    if v_report.prepared_by = auth.uid() then
      -- Verificar si hay suplente activo y vigente
      if not exists (
        select 1 from public.approval_deputies
        where user_id = auth.uid() and active
          and valid_from <= current_date
          and (valid_until is null or valid_until >= current_date)
      ) then
        perform public.log_audit('TRANSITION_REPORT_DENIED','REPORT', p_report_id, null,
          jsonb_build_object('to_status', 'APPROVED', 'reason', 'segregacion_preparador_aprobador'));
        return jsonb_build_object(
          'ok', false, 'error_code', 'SEGREGATION_VIOLATION',
          'message', 'Quien preparó el reporte no puede aprobarlo. Se requiere un suplente activo.'
        );
      end if;
    end if;
  end if;

  -- Ejecutar validaciones antes de pasar a revisión
  if p_to_status = 'READY_FOR_REVIEW' then
    -- Verificar que no hay errores bloqueantes en el último run
    if exists (
      select 1 from public.validation_issues vi
      join public.validation_runs vr on vr.id = vi.validation_run_id
      join public.report_samples rs on rs.sample_id = vr.entity_id
      where rs.report_id = p_report_id
        and vi.blocking and not vi.resolved
        and vr.status = 'COMPLETED'
    ) then
      return jsonb_build_object(
        'ok', false, 'error_code', 'BLOCKING_VALIDATIONS',
        'message', 'Existen errores bloqueantes en la validación. Corrígelos antes de enviar a revisión.'
      );
    end if;
  end if;

  -- Actualizar — bypass del trigger de status usando una función security definer
  update public.reports
  set status = p_to_status, updated_at = now(), updated_by = auth.uid()
  where id = p_report_id;

  -- Registrar revisión o aprobación
  if p_to_status in ('RETURNED','APPROVED') then
    insert into public.report_reviews (report_id, reviewer_id, decision, comments)
    values (p_report_id, auth.uid(),
      case p_to_status when 'APPROVED' then 'APPROVED' else 'RETURNED' end,
      p_comment);
  end if;

  perform public.log_audit('REPORT_TRANSITION','REPORT', p_report_id,
    jsonb_build_object('status', v_report.status),
    jsonb_build_object('status', p_to_status, 'comment', p_comment));

  return jsonb_build_object('ok', true, 'new_status', p_to_status);
end;
$$;

-- ─── RPC: issue_report ────────────────────────────────────────────────────────
create or replace function public.issue_report(
  p_report_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_report   public.reports%rowtype;
  v_code     text;
  v_counter  bigint;
  v_snap     jsonb;
  v_hash     text;
begin
  select * into v_report from public.reports where id = p_report_id;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_FOUND');
  end if;

  -- Solo desde APPROVED
  if v_report.status <> 'APPROVED' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_STATUS',
      'message', 'Solo se puede emitir desde estado APPROVED.');
  end if;

  -- Rol y segregación
  if not public.has_role('JEFE_TECNICA_CALIDAD') then
    perform public.log_audit('ISSUE_REPORT_DENIED','REPORT', p_report_id, null,
      jsonb_build_object('reason', 'rol insuficiente'));
    return jsonb_build_object('ok', false, 'error_code', 'INSUFFICIENT_ROLE');
  end if;

  if v_report.prepared_by = auth.uid() then
    perform public.log_audit('ISSUE_REPORT_DENIED','REPORT', p_report_id, null,
      jsonb_build_object('reason', 'segregacion'));
    return jsonb_build_object('ok', false, 'error_code', 'SEGREGATION_VIOLATION');
  end if;

  -- Reportes externos pendientes
  if exists (
    select 1 from public.report_samples rs
    where rs.report_id = p_report_id
      and public.sample_has_pending_external_reports(rs.sample_id)
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'PENDING_EXTERNAL_REPORTS',
      'message', 'Existen reportes de laboratorio externo pendientes.');
  end if;

  -- Asignar consecutivo
  v_counter := public.next_counter('RSA', extract(year from now())::int);
  v_code := 'RSA-' || lpad(v_counter::text, 4, '0') || '-' || extract(year from now())::text;

  -- Construir snapshot — datos vivos en este momento
  select jsonb_build_object(
    'report_id', p_report_id,
    'code', v_code,
    'issued_at', now(),
    'issued_by', auth.uid(),
    'samples', (
      select jsonb_agg(to_jsonb(rs))
      from public.report_samples rs
      where rs.report_id = p_report_id
    ),
    'results', (
      select jsonb_agg(to_jsonb(rr))
      from public.report_results rr
      where rr.report_id = p_report_id
    )
  ) into v_snap;

  -- Hash del snapshot (pgcrypto)
  v_hash := encode(extensions.digest(v_snap::text, 'sha256'), 'hex');

  -- Insertar snapshot
  insert into public.report_snapshots (report_id, snapshot_data, snapshot_hash)
  values (p_report_id, v_snap, v_hash);

  -- Actualizar reporte a ISSUED
  update public.reports
  set status = 'ISSUED', code = v_code, issued_at = now(), updated_at = now(), updated_by = auth.uid()
  where id = p_report_id;

  perform public.log_audit('REPORT_ISSUED','REPORT', p_report_id, null,
    jsonb_build_object('code', v_code, 'issued_at', now()));

  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;

-- ─── RPC: rectify_report ─────────────────────────────────────────────────────
create or replace function public.rectify_report(
  p_report_id uuid,
  p_reason    text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_report public.reports%rowtype;
  v_new_id uuid;
begin
  if btrim(coalesce(p_reason,'')) = '' then
    return jsonb_build_object('ok', false, 'error_code', 'REASON_REQUIRED',
      'message', 'El motivo de rectificación es obligatorio.');
  end if;

  select * into v_report from public.reports where id = p_report_id;
  if not found or v_report.status <> 'ISSUED' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_STATUS');
  end if;

  if not public.has_any_role(array['JEFE_TECNICA_CALIDAD','ADMIN']) then
    perform public.log_audit('RECTIFY_REPORT_DENIED','REPORT', p_report_id, null,
      jsonb_build_object('reason', 'rol insuficiente'));
    return jsonb_build_object('ok', false, 'error_code', 'INSUFFICIENT_ROLE');
  end if;

  -- Crear nueva versión en DRAFT
  insert into public.reports (
    version, status, client_id, contact_id, template_id,
    prepared_by, replaces_report_id, rectification_reason, created_by, updated_by
  )
  values (
    v_report.version + 1, 'DRAFT', v_report.client_id, v_report.contact_id, v_report.template_id,
    auth.uid(), p_report_id, p_reason, auth.uid(), auth.uid()
  )
  returning id into v_new_id;

  -- Marcar original como RECTIFIED
  update public.reports set status = 'RECTIFIED', updated_at = now() where id = p_report_id;

  perform public.log_audit('REPORT_RECTIFIED','REPORT', p_report_id,
    jsonb_build_object('status','ISSUED'),
    jsonb_build_object('status','RECTIFIED','new_report_id', v_new_id, 'reason', p_reason));

  return jsonb_build_object('ok', true, 'new_report_id', v_new_id);
end;
$$;

-- ─── Triggers de actualización ────────────────────────────────────────────────
create trigger reports_updated_at           before update on public.reports           for each row execute function public.set_updated_at();
create trigger report_comments_updated_at   before update on public.report_comments   for each row execute function public.set_updated_at();
create trigger approval_deputies_updated_at before update on public.approval_deputies for each row execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.reports                    enable row level security;
alter table public.report_samples             enable row level security;
alter table public.report_results             enable row level security;
alter table public.report_regulation_columns  enable row level security;
alter table public.report_reviews             enable row level security;
alter table public.report_approvals           enable row level security;
alter table public.report_comments            enable row level security;
alter table public.report_snapshots           enable row level security;
alter table public.report_files               enable row level security;
alter table public.report_status_transitions  enable row level security;
alter table public.approval_deputies          enable row level security;

-- reports: ANALISTA crea y edita propios; JTC revisa/aprueba; AUDITOR lee
create policy "reports: analista own" on public.reports for select to authenticated using (prepared_by = auth.uid() and public.has_role('ANALISTA'));
create policy "reports: jtc read"     on public.reports for select to authenticated using (public.has_any_role(array['JEFE_TECNICA_CALIDAD','ADMIN','AUDITOR']));
create policy "reports: analista write" on public.reports for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN']));

-- Tablas relacionadas: lectura amplia; escritura solo roles autorizados
create policy "report_samples: read"  on public.report_samples for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));
create policy "report_samples: write" on public.report_samples for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN']));

create policy "report_results: read"  on public.report_results for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));
create policy "report_results: write" on public.report_results for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN']));

create policy "report_reviews: read"  on public.report_reviews for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));
create policy "report_reviews: write" on public.report_reviews for insert to authenticated with check (public.has_role('JEFE_TECNICA_CALIDAD'));

create policy "report_approvals: read"  on public.report_approvals for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));
create policy "report_approvals: write" on public.report_approvals for insert to authenticated with check (public.has_role('JEFE_TECNICA_CALIDAD'));

create policy "report_snapshots: read" on public.report_snapshots for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));

create policy "report_files: read"  on public.report_files for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));
create policy "report_files: write" on public.report_files for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN']));

create policy "report_comments: read"  on public.report_comments for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));
create policy "report_comments: write" on public.report_comments for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD']));

create policy "report_reg_cols: read"  on public.report_regulation_columns for select to authenticated using (public.has_any_role(array['ANALISTA','ADMIN','JEFE_TECNICA_CALIDAD','AUDITOR']));
create policy "report_reg_cols: write" on public.report_regulation_columns for insert to authenticated with check (public.has_any_role(array['ANALISTA','ADMIN']));

create policy "status_transitions: read" on public.report_status_transitions for select to authenticated using (public.current_user_is_active());

create policy "approval_deputies: read"  on public.approval_deputies for select to authenticated using (public.current_user_is_active());
create policy "approval_deputies: write" on public.approval_deputies for insert to authenticated with check (public.has_role('ADMIN'));
create policy "approval_deputies: update" on public.approval_deputies for update to authenticated using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

-- ─── Grants ───────────────────────────────────────────────────────────────────
grant select, insert on public.reports, public.report_samples, public.report_results, public.report_regulation_columns, public.report_reviews, public.report_approvals, public.report_comments, public.report_snapshots, public.report_files to authenticated;
grant select on public.report_status_transitions to authenticated;
grant select, insert, update on public.approval_deputies to authenticated;
grant execute on function public.transition_report(uuid, text, text) to authenticated;
grant execute on function public.issue_report(uuid) to authenticated;
grant execute on function public.rectify_report(uuid, text) to authenticated;

revoke all on function public.prevent_direct_report_status_update() from public, anon, authenticated;
revoke all on function public.prevent_issued_report_mutation() from public, anon, authenticated;
revoke all on function public.close_issue_on_decision() from public, anon, authenticated;
