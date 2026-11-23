-- E2E fixture seed — test project only
-- Run AFTER supabase/seed.sql and supabase/seed/*.sql
-- Creates a minimal but complete data set for E2E tests:
--   · One active client (DEMO)
--   · One contact
--   · One active quote with two tests
--
-- Requires:
--   · At least one active matrix row in public.matrices (e.g. 'AP')
--   · At least two test rows in public.tests (SA tests from seed phase 1)
--   · An active ADMIN user profile (created separately via Supabase Auth)
--
-- After running this script, record the generated UUIDs in .env.e2e:
--   E2E_DEMO_CLIENT_ID=<uuid of the client row>
--   E2E_DEMO_CONTACT_ID=<uuid of the contact row>
--   E2E_DEMO_QUOTE_ID=<uuid of the quote row>
--
-- IMPORTANT: Contains no real client data. Never run against production.

-- ── 1. Demo client ────────────────────────────────────────────────────────
insert into public.clients (
  id, business_name, tax_id, active, created_at, updated_at
) values (
  gen_random_uuid(),
  'Cliente Demo E2E',
  '900000001-0',
  true,
  now(), now()
)
on conflict do nothing
returning id as client_id;

-- ── 2. Demo contact ───────────────────────────────────────────────────────
-- (run after client insert; replace <CLIENT_ID> with the returned UUID)
-- insert into public.contacts (id, client_id, full_name, email, phone, active, created_at, updated_at)
-- values (gen_random_uuid(), '<CLIENT_ID>', 'Contacto Demo', 'demo@labrepsys.test', '3001234567', true, now(), now());

-- ── 3. Demo quote ─────────────────────────────────────────────────────────
-- After running steps 1 and 2, create a quote via the application UI with
-- the COMERCIAL or ADMIN role, or use the save_quote() RPC:
--
--   SELECT public.save_quote(
--     NULL,
--     jsonb_build_object(
--       'client_id',   '<CLIENT_ID>',
--       'contact_id',  '<CONTACT_ID>',
--       'observations', 'Cotización de prueba E2E',
--       'tests', jsonb_build_array(
--         jsonb_build_object('test_id', '<TEST_ID_1>', 'execution_type', 'SA', 'suggested_laboratory_id', null),
--         jsonb_build_object('test_id', '<TEST_ID_2>', 'execution_type', 'SA', 'suggested_laboratory_id', null)
--       ),
--       'regulations', '[]'::jsonb
--     )
--   );
--
-- Then set the quote status to ACTIVE:
--   SELECT public.set_quote_status('<QUOTE_ID>', 'ACTIVE');

-- ── Notes ─────────────────────────────────────────────────────────────────
-- TEST UUIDs for the demo entities will be stable across test runs once set.
-- Record them as E2E_DEMO_* env vars. The E2E tests skip data-dependent
-- assertions when those vars are PENDING (see e2e/helpers/demo-data.ts).
