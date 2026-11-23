-- p04: Validaciones del código y seguridad de recepción.
\ir 000_helpers.psql
begin;

select plan(10);
select tests.authenticate_fixture_admin() as fixture_admin_id \gset

select ok(
  (select relrowsecurity from pg_class where oid = 'public.samples'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.sample_receptions'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.sample_tests'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.sample_events'::regclass),
  'RLS está habilitado en todas las tablas de muestras'
);

select tests.create_test_user('RECEPCION') as reception_user \gset
insert into public.clients (id, business_name, active)
values ('50000000-0000-0000-0000-000000000001', 'Cliente prueba p04', true);

select tests.set_role_context('RECEPCION', :'reception_user');
set local role authenticated;

select ok(
  'AG0346' ~ (select value #>> '{}' from public.app_settings where key = 'sample.code_pattern')
  and 'AG00106' !~ (select value #>> '{}' from public.app_settings where key = 'sample.code_pattern'),
  'El patrón por defecto acepta AG0346 y rechaza AG00106'
);

select throws_ok(
  $$select public.save_sample(null, jsonb_build_object(
    'code', 'AG00106', 'client_id', '50000000-0000-0000-0000-000000000001',
    'tests', '[]'::jsonb, 'containers', '[]'::jsonb, 'preservation', '{}'::jsonb,
    'reception', jsonb_build_object('has_deviation', false),
    'request_review', jsonb_build_object('capacity_verified', true, 'methods_verified', true)
  ))$$,
  '22023', null,
  'El trigger de base de datos rechaza AG00106'
);

select public.save_sample(null, jsonb_build_object(
  'code', 'AG0346', 'client_id', '50000000-0000-0000-0000-000000000001',
  'tests', '[]'::jsonb, 'containers', '[]'::jsonb, 'preservation', '{}'::jsonb,
  'reception', jsonb_build_object('has_deviation', false),
  'request_review', jsonb_build_object('capacity_verified', true, 'methods_verified', true)
)) as valid_sample_id \gset

select is(
  (select is_demo from public.samples where code = 'AG0346'),
  false,
  'Las muestras operativas no quedan marcadas como DEMO por defecto'
);

select throws_ok(
  $$select public.save_sample(null, jsonb_build_object(
    'code', 'AG0346', 'client_id', '50000000-0000-0000-0000-000000000001',
    'tests', '[]'::jsonb, 'containers', '[]'::jsonb, 'preservation', '{}'::jsonb,
    'reception', jsonb_build_object('has_deviation', false),
    'request_review', jsonb_build_object('capacity_verified', true, 'methods_verified', true)
  ))$$,
  '23505', null,
  'El código de muestra no se puede duplicar'
);

select ok(
  not has_table_privilege('authenticated', 'public.samples', 'INSERT')
  and not has_table_privilege('authenticated', 'public.samples', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.sample_receptions', 'UPDATE'),
  'Usuarios autenticados no tienen escritura directa en muestras ni recepciones'
);

select throws_ok(
  $$
    select public.save_sample(
      '50000000-0000-0000-0000-000000000099',
      '{}'::jsonb,
      null
    )
  $$,
  '22023', null,
  'La edición posterior sin motivo es rechazada'
);

select throws_ok(
  $$
    select public.save_sample(
      null,
      jsonb_build_object(
        'code', 'AG0347',
        'client_id', '50000000-0000-0000-0000-000000000001',
        'quote_id', null,
        'matrix_id', null,
        'tests', '[]'::jsonb,
        'containers', '[]'::jsonb,
        'preservation', '{}'::jsonb,
        'reception', jsonb_build_object(
          'has_deviation', true,
          'deviations', 'Envase deteriorado',
          'client_consulted_on_deviation', false
        ),
        'request_review', jsonb_build_object(
          'capacity_verified', true,
          'methods_verified', true
        )
      ),
      null
    )
  $$,
  '22023', null,
  'Una desviación requiere dejar constancia de consulta al cliente'
);

select throws_ok(
  $$
    select public.save_sample(
      null,
      jsonb_build_object(
        'code', 'AG0348',
        'client_id', '50000000-0000-0000-0000-000000000001',
        'quote_id', null,
        'matrix_id', null,
        'tests', jsonb_build_array(jsonb_build_object(
          'test_id', '50000000-0000-0000-0000-000000000002',
          'execution_type', 'SUBCONTRACTED',
          'assigned_laboratory_id', null
        )),
        'containers', '[]'::jsonb,
        'preservation', '{}'::jsonb,
        'reception', jsonb_build_object(
          'has_deviation', false,
          'client_consulted_on_deviation', false
        ),
        'request_review', jsonb_build_object(
          'capacity_verified', true,
          'methods_verified', true
        )
      ),
      null
    )
  $$,
  '22023', null,
  'Un ensayo subcontratado requiere laboratorio asignado'
);

select throws_ok(
  $$
    select public.save_sample(
      null,
      jsonb_build_object(
        'code', 'AG0349',
        'client_id', '50000000-0000-0000-0000-000000000001',
        'quote_id', '50000000-0000-0000-0000-000000000003',
        'matrix_id', null,
        'quote_suggestions_confirmed', false,
        'tests', '[]'::jsonb,
        'containers', '[]'::jsonb,
        'preservation', '{}'::jsonb,
        'reception', jsonb_build_object('has_deviation', false),
        'request_review', jsonb_build_object(
          'capacity_verified', true,
          'methods_verified', true
        )
      ),
      null
    )
  $$,
  '22023', null,
  'La cotización sugerida exige confirmación explícita'
);

select * from finish();
rollback;
