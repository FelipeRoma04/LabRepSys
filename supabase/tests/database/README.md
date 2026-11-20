# Pruebas de base de datos (pgTAP) — K02

Pruebas SQL que verifican seguridad, RLS, acceso por rol y reglas de dominio.

## Estructura

```
supabase/tests/database/
  helpers.sql          Ayudantes para simular usuarios por rol
  00_global_security   RLS activo, sin políticas permisivas, search_path, security_invoker, buckets privados
  10_roles_access      Matriz de acceso por rol, auditoría inmutable, no auto-asignación de roles
  20_catalogs          Código SA válido/inválido, next_counter consecutivo, versionado de ensayos
  30_commercial        NIT único, contacto del cliente correcto, consecutivo y auditoría de cotizaciones
  40_rsa_reports       segregación, emisión denegada y auditoría
  50_samples_reception Código AG, escritura solo por RPC, consulta de desviaciones y laboratorio requerido
  55_field_data_attachments Valor cero frente a ausencia, coordenadas, motivo posterior a recepción, RLS y RPC
  60_reconciliation   estados, permisos y auditoría de conciliación
  70_excel_import_batches lotes idempotentes, archivos y resultados de importación
```

## Cómo ejecutar

### Opción A — Proyecto de pruebas dedicado (recomendado)

```bash
# 1. Crear un proyecto Supabase separado solo para pruebas
# 2. Enlazar al proyecto de pruebas
npx supabase link --project-ref <PROYECTO_PRUEBAS_REF>

# 3. Aplicar migraciones en el proyecto de pruebas
npx supabase db push

# 4. Ejecutar pruebas
npx supabase test db
```

> **NUNCA ejecutar contra el proyecto de producción o desarrollo con datos reales.**

### Opción B — Docker local

```bash
# Requiere Docker Desktop instalado
npx supabase start
npx supabase test db
```

## Convenciones

- Cada archivo usa `BEGIN` / `ROLLBACK` para no persistir datos de prueba.
- `tests.create_test_user(role, active)` crea un usuario transitorio dentro de la transacción.
- `tests.set_role_context(role, user_id)` simula el JWT de Supabase con `set_config`.
- Las pruebas de módulos aún no implementados usan `skip()` explícito (nunca fallan por entidad inexistente).

## Agregar pruebas de un módulo nuevo

1. Crear `supabase/tests/database/NN_<modulo>.sql`.
2. Verificar existencia de la tabla con `to_regclass` antes de cualquier test.
3. Usar `skip(condition, 'razón')` para marcar explícitamente lo pendiente.
4. Mantener todo dentro de `BEGIN` / `ROLLBACK`.
