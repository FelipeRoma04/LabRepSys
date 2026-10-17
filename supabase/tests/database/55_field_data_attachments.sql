-- p05: datos de campo, adjuntos y segregación de acceso.
begin;

select plan(11);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.field_parameters'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.sample_field_data'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.sample_field_measurements'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.sample_attachments'::regclass),
  'RLS está habilitado en todas las tablas de datos de campo y adjuntos'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.sample_field_data'::regclass
      and confrelid = 'public.samples'::regclass
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.sample_field_measurements'::regclass
      and confrelid = 'public.samples'::regclass
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.sample_attachments'::regclass
      and confrelid = 'public.samples'::regclass
  ),
  'Los datos de campo y adjuntos conservan su muestra mediante FK'
);

select ok(
  not has_table_privilege('authenticated', 'public.sample_field_data', 'INSERT')
  and not has_table_privilege('authenticated', 'public.sample_field_data', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.sample_field_measurements', 'INSERT')
  and not has_table_privilege('authenticated', 'public.sample_attachments', 'INSERT')
  and not has_table_privilege('authenticated', 'public.sample_attachments', 'UPDATE'),
  'Los cambios de datos de campo y adjuntos no usan DML directo'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.save_sample_field_data(uuid,jsonb,jsonb,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.register_sample_attachment(uuid,text,text,text,text,bigint,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.retire_sample_attachment(uuid,text)',
    'EXECUTE'
  ),
  'Las RPC de escritura están disponibles a usuarios autenticados y validan el rol'
);

select tests.create_test_user('MUESTREO') as sampler_id \gset
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'sampler_id', 'role', 'authenticated')::text,
  true
);
insert into public.clients (id, business_name, active)
values ('55000000-0000-0000-0000-000000000001', 'Cliente prueba p05', true);
insert into public.samples (id, code, client_id, status)
values (
  '55000000-0000-0000-0000-000000000002',
  'AG5500',
  '55000000-0000-0000-0000-000000000001',
  'PENDING_REVIEW'
);
select id as ph_parameter_id
  from public.field_parameters
 where code = 'ph' \gset
select id as conductivity_parameter_id
  from public.field_parameters
 where code = 'conductivity' \gset
select tests.set_role_context('MUESTREO', :'sampler_id'::uuid);

select ok(
  (public.save_sample_field_data(
    '55000000-0000-0000-0000-000000000002',
    jsonb_build_object(
      'latitude_original', '4 42 39',
      'longitude_original', '-74.0721',
      'coordinate_state', 'AMBIGUOUS',
      'collected_by', :'sampler_id',
      'notes', null
    ),
    jsonb_build_array(
      jsonb_build_object(
        'field_parameter_id', :'ph_parameter_id',
        'value_state', 'VALUE',
        'numeric_value', 0,
        'unit', 'Unidades pH',
        'original_text', '0'
      ),
      jsonb_build_object(
        'field_parameter_id', :'conductivity_parameter_id',
        'value_state', 'NOT_REPORTED',
        'numeric_value', null,
        'unit', 'µS/cm',
        'original_text', null
      )
    ),
    null
  ) ->> 'ok')::boolean,
  'MUESTREO puede guardar datos antes de completar recepción'
);

select is(
  (select numeric_value from public.sample_field_measurements
    where sample_id = '55000000-0000-0000-0000-000000000002'
      and field_parameter_id = :'ph_parameter_id'::uuid),
  0::numeric,
  'El valor VALUE igual a cero se conserva como dato numérico'
);

select ok(
  (select value_state = 'NOT_REPORTED' and numeric_value is null
     from public.sample_field_measurements
    where sample_id = '55000000-0000-0000-0000-000000000002'
      and field_parameter_id = :'conductivity_parameter_id'::uuid),
  'NOT_REPORTED permanece distinto de cero y sin valor numérico'
);

select ok(
  (select latitude_original = '4 42 39'
      and latitude_normalized is null
      and longitude_normalized is null
      and coordinate_state = 'AMBIGUOUS'
     from public.sample_field_data
    where sample_id = '55000000-0000-0000-0000-000000000002'),
  'Las coordenadas ambiguas conservan el original y no se normalizan'
);

reset role;
update public.samples
   set status = 'RECEIVED'
 where id = '55000000-0000-0000-0000-000000000002';
select tests.set_role_context('MUESTREO', :'sampler_id'::uuid);

select throws_ok(
  $$
    select public.save_sample_field_data(
      '55000000-0000-0000-0000-000000000002',
      jsonb_build_object('coordinate_state', 'PENDING'),
      '[]'::jsonb,
      null
    )
  $$,
  '22023',
  'Se requiere un motivo para editar datos después de la recepción.',
  'La RPC rechaza ediciones posteriores a recepción sin motivo'
);

select ok(
  (public.save_sample_field_data(
    '55000000-0000-0000-0000-000000000002',
    jsonb_build_object(
      'latitude_original', '4.711',
      'longitude_original', '-74.0721',
      'latitude_normalized', 4.711,
      'longitude_normalized', -74.0721,
      'coordinate_state', 'NORMALIZED',
      'collected_by', :'sampler_id',
      'notes', 'Corrección justificada'
    ),
    '[]'::jsonb,
    'Corrección confirmada en campo'
  ) ->> 'ok')::boolean,
  'La edición posterior con motivo queda aceptada por RPC'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where entity_type = 'SAMPLE_FIELD_DATA'
      and entity_id = '55000000-0000-0000-0000-000000000002'
      and reason = 'Corrección confirmada en campo'
      and action = 'SAMPLE_FIELD_DATA_UPDATED'
  ),
  'La edición posterior queda registrada en auditoría con su motivo'
);

select * from finish();
rollback;
