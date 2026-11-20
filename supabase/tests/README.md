# Pruebas de base de datos (pgTAP) — K02

Pruebas SQL que verifican seguridad, RLS, acceso por rol y reglas de dominio.

## Estructura

```
supabase/tests/database/
  000_helpers.psql     Ayudantes incluidos dentro de cada transacción de prueba
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
npx supabase test db --linked
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
- Cada archivo `.sql` incluye `000_helpers.psql` con `\ir`; las funciones auxiliares existen dentro de la transacción del test y se revierten al finalizar.
- `tests.set_role_context(role, user_id)` simula los claims JWT. El test ejecuta `SET LOCAL ROLE authenticated` por separado, porque PostgreSQL no permite `SET ROLE` dentro de una función.
- Los tests de módulos opcionales consultan la existencia de la tabla y emiten un resultado `SKIP` si falta.

## Cobertura pendiente

- `next_counter` se comprueba con llamadas secuenciales. La prueba concurrente especificada en K02 requiere una estrategia de conexiones paralelas y aún no está implementada.
- La matriz de roles prueba lectura y escritura sobre matrices, además de restricciones concretas de perfil, roles y auditoría. Falta ampliar la tabla de permisos esperados a todas las tablas public; la especificación no contiene esa matriz detallada.
- La suite pgTAP debe ejecutarse contra un stack local con Docker o un proyecto de pruebas dedicado antes de marcar K02 como terminado.

## Agregar pruebas de un módulo nuevo

1. Crear `supabase/tests/database/NN_<modulo>.sql`.
2. Verificar existencia de la tabla con `to_regclass` antes de cualquier test.
3. Usar `\if` y `skip()` para omitir explícitamente los casos cuando el módulo no exista.
4. Mantener todo dentro de `BEGIN` / `ROLLBACK`.
