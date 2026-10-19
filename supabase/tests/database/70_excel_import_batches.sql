begin;

select plan(11);

select tests.create_test_user('ADMIN') as admin_user \gset
select tests.create_test_user('RECEPCION') as reception_user \gset

select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'admin_user', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select ok(
  (select relrowsecurity from pg_class where oid = 'public.excel_import_batches'::regclass),
  'La tabla de importaciones Excel tiene RLS habilitado'
);

select ok(
  not has_table_privilege('authenticated', 'public.excel_import_batches', 'SELECT'),
  'Los clientes no pueden consultar directamente las importaciones'
);

select is(
  public.has_excel_import('tests', repeat('a', 64)),
  false,
  'Una importación nueva no figura como procesada'
);

select is(
  public.record_excel_import('tests', repeat('a', 64), 'ensayos.xlsx', 3, 1, false),
  true,
  'ADMIN puede registrar una importación parcial'
);

select is(
  public.has_excel_import('tests', repeat('a', 64)),
  false,
  'Una importación parcial permite reintentar el archivo'
);

select is(
  public.record_excel_import('tests', repeat('a', 64), 'ensayos.xlsx', 3, 2, true),
  true,
  'El reintento actualiza el lote parcial a completo'
);

select is(
  public.has_excel_import('tests', repeat('a', 64)),
  true,
  'El archivo completo queda marcado como procesado'
);

select is(
  public.record_excel_import('tests', repeat('a', 64), 'ensayos.xlsx', 3, 2, true),
  false,
  'El mismo hash completo no se registra por segunda vez'
);

select is(
  (select imported_count from public.excel_import_batches where target = 'tests' and file_hash = repeat('a', 64)),
  3,
  'El total acumulado solo incluye filas importadas en los reintentos'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'EXCEL_TESTS_IMPORT'
      and new_data ->> 'file_name' = 'ensayos.xlsx'
      and new_data ->> 'file_hash' = repeat('a', 64)
  ),
  'La auditoría incluye el nombre y el hash del archivo'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'reception_user', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select public.has_excel_import('tests', repeat('b', 64))$$,
  '42501',
  'RECEPCION no puede consultar importaciones del catálogo de ensayos'
);

select * from finish();
rollback;
