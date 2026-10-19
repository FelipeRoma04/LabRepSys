-- DEMO ONLY. Run manually in a non-production project after a sample AG0346 exists.
-- Every inserted issue is marked is_demo and is excluded from the normal queue by default.
do $$
declare
  demo_sample_id uuid;
begin
  select id into demo_sample_id
    from public.samples
   where code = 'AG0346'
   limit 1;

  if demo_sample_id is null then
    raise exception 'DEMO seed requires an existing sample with code AG0346.';
  end if;

  insert into public.reconciliation_issues (
    sample_id, issue_type, field_name, source_a, value_a, source_b, value_b,
    source_c, value_c, entity_type, entity_id, related_entity_id,
    is_demo, demo_sample_code, fingerprint
  )
  select
    demo_sample_id,
    demo.issue_type,
    demo.field_name,
    demo.source_a,
    demo.value_a,
    demo.source_b,
    demo.value_b,
    demo.source_c,
    demo.value_c,
    demo.entity_type,
    demo.entity_id,
    demo.related_entity_id,
    true,
    'AG0346',
    encode(digest(concat_ws(E'\x1f',
      'DEMO', 'AG0346', demo.issue_type, coalesce(demo.entity_type, ''),
      coalesce(demo.field_name, ''), coalesce(demo.value_a, ''),
      coalesce(demo.value_b, '')
    ), 'sha256'), 'hex')
  from (values
    ('DATE_MISMATCH', 'sampling_date', 'Recepción', '2026-05-29',
      'Fuente externa', '2026-05-26', null::text, null::text,
      'SAMPLE', demo_sample_id, null::uuid),
    ('MATRIX_MISMATCH', 'matrix', 'Recepción', 'ARnD',
      'Fuente externa', 'ARD', 'Catálogo', 'ARnD',
      'SAMPLE', demo_sample_id, null::uuid),
    ('UNREQUESTED_PARAMETER', 'external_parameter', 'Ensayos solicitados', null,
      'Fuente externa', 'Color', null, null,
      'IMPORT_ROW', null::uuid, null::uuid),
    ('MISSING_RESULT', 'result', 'Ensayos solicitados', 'AOX',
      'Resultados registrados', null, null, null,
      'SAMPLE_TEST', null::uuid, null::uuid),
    ('LCM_MISMATCH', 'lcm', 'Catálogo', 'Catálogo (demo)',
      'Fuente externa', 'Informe (demo)', null, null,
      'RESULT', null::uuid, null::uuid),
    ('METHOD_MISMATCH', 'method', 'Catálogo', 'Catálogo (demo)',
      'Fuente externa', 'Informe (demo)', null, null,
      'RESULT', null::uuid, null::uuid),
    ('UNIT_MISMATCH', 'unit', 'Catálogo', 'Catálogo (demo)',
      'Fuente externa', 'Informe (demo)', null, null,
      'RESULT', null::uuid, null::uuid),
    ('TECHNIQUE_MISMATCH', 'technique', 'Catálogo', 'Catálogo (demo)',
      'Fuente externa', 'Informe (demo)', null, null,
      'RESULT', null::uuid, null::uuid),
    ('DUPLICATE_RESULT', 'result', 'Resultado', '< 0,040',
      'Resultado duplicado', '< 0,040', null, null,
      'RESULT', null::uuid, null::uuid),
    ('LAB_DEVIATION', 'deviation', 'Desviación', null,
      'Fuente externa', 'Desviación informada (demo)', null, null,
      'RESULT_IMPORT', null::uuid, null::uuid),
    ('LEGACY_CODE_NO_MAPPING', 'legacy_code', 'Código externo', 'CHEM',
      'Fuente externa', 'AOX', 'Código SA', null,
      'IMPORT_ROW', null::uuid, null::uuid),
    ('INCOMPLETE_TEST_FIELDS', 'test_fields', 'Catálogo', 'AOX',
      'Campos faltantes', 'Pendientes según ficha técnica (demo)', null, null,
      'TEST', null::uuid, null::uuid),
    ('EXTERNAL_REPORT_PENDING', 'external_shipment', 'Envío externo', 'Pendiente',
      'Estado', 'Reporte externo pendiente (demo)', 'Laboratorio', 'Laboratorio externo (demo)',
      'EXTERNAL_SHIPMENT', null::uuid, null::uuid)
  ) as demo(
    issue_type, field_name, source_a, value_a, source_b, value_b,
    source_c, value_c, entity_type, entity_id, related_entity_id
  )
  where not exists (
    select 1 from public.reconciliation_issues existing
     where existing.is_demo
       and existing.demo_sample_code = 'AG0346'
       and existing.issue_type = demo.issue_type
  )
  on conflict (fingerprint) where fingerprint is not null and status = 'OPEN' do nothing;
end;
$$;
