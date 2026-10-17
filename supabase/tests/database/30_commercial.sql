-- p03: Clientes, contactos y cotizaciones.
begin;

select plan(5);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.clients'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.contacts'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.quotes'::regclass),
  'RLS está habilitado en las tablas comerciales'
);

select tests.create_test_user('ADMIN') as admin_id \gset
select tests.create_test_user('COMERCIAL') as commercial_id \gset
select tests.set_role_context('ADMIN', :'admin_id');

insert into public.app_settings (key, value, description)
values ('document.format.COT', to_jsonb('COT-NNNN-AAAA'::text), 'Formato de prueba')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description;

select tests.set_role_context('COMERCIAL', :'commercial_id');

insert into public.clients (id, nit, business_name, active)
values
  ('30000000-0000-0000-0000-000000000001', '900123456', 'Cliente Uno', true),
  ('30000000-0000-0000-0000-000000000002', '900654321', 'Cliente Dos', true);

insert into public.contacts (id, client_id, name, active)
values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Contacto Uno',
  true
);

select throws_ok(
  $$
    insert into public.clients (nit, business_name)
    values (' 900123456 ', 'Duplicado NIT')
  $$,
  '23505',
  'Un NIT existente no puede repetirse aunque tenga espacios exteriores'
);

select throws_ok(
  $$
    select public.save_quote(
      null,
      jsonb_build_object(
        'client_id', '30000000-0000-0000-0000-000000000002',
        'contact_id', '40000000-0000-0000-0000-000000000001',
        'quote_date', '2026-10-17',
        'valid_until', '2026-11-17',
        'tests', '[]'::jsonb,
        'regulations', '[]'::jsonb
      )
    )
  $$,
  '23503',
  'Una cotización rechaza el contacto perteneciente a otro cliente'
);

select public.save_quote(
  null,
  jsonb_build_object(
    'client_id', '30000000-0000-0000-0000-000000000001',
    'contact_id', '40000000-0000-0000-0000-000000000001',
    'quote_date', '2026-10-17',
    'valid_until', '2026-11-17',
    'tests', '[]'::jsonb,
    'regulations', '[]'::jsonb
  )
) as quote_id \gset

select public.set_quote_status(:'quote_id'::uuid, 'ACTIVE');
select ok(
  (select code ~ '^COT-[0-9]{4,}-2026$' and status = 'ACTIVE'
   from public.quotes where id = :'quote_id'::uuid),
  'La cotización obtiene consecutivo configurable y admite transición a vigente'
);

select tests.set_role_context('ADMIN', :'admin_id');
select is(
  (
    select count(*)::int from public.audit_logs
    where entity_type = 'QUOTES' and entity_id = :'quote_id'::uuid
  ),
  2,
  'Crear y cambiar el estado de una cotización genera auditoría'
);

select * from finish();
rollback;
