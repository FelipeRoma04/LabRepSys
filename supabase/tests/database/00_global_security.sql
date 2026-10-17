-- K02: Reglas globales de seguridad
-- Req 1.1-1.5: RLS activo, sin políticas permisivas, search_path fijo, security_invoker, buckets privados

begin;
select plan(5);

-- ── Test 1: RLS activo en todas las tablas public ────────────────────────────
-- Req 1.1
select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  ),
  0,
  'Todas las tablas public deben tener RLS activo'
);

-- ── Test 2: Sin políticas de escritura con USING (true) o WITH CHECK (true) ──
-- Req 1.2
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (qual = 'true' or with_check = 'true')
  ),
  0,
  'No deben existir políticas de escritura permisivas (USING/WITH CHECK true)'
);

-- ── Test 3: Funciones security definer con search_path fijo ──────────────────
-- Req 1.3
select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true  -- security definer
      and (
        p.proconfig is null
        or not exists (
          select 1 from unnest(p.proconfig) as cfg
          where cfg like 'search_path=%'
        )
      )
  ),
  0,
  'Todas las funciones security definer deben fijar search_path'
);

-- ── Test 4: Vistas public con security_invoker ───────────────────────────────
-- Req 1.4
select is(
  (
    select count(*)::int
    from pg_views v
    where v.schemaname = 'public'
      and not exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relname = v.viewname
          and n.nspname = 'public'
          and (c.reloptions @> array['security_invoker=true']
               or c.reloptions @> array['security_invoker=on'])
      )
  ),
  0,
  'Todas las vistas public deben usar security_invoker = true'
);

-- ── Test 5: Buckets de Storage deben ser privados (public = false) ───────────
-- Req 1.5
-- Nota: storage.buckets es accesible en el test environment con service role
select is(
  (
    select count(*)::int
    from storage.buckets
    where public = true
  ),
  0,
  'Todos los buckets de Storage deben ser privados'
);

select * from finish();
rollback;
