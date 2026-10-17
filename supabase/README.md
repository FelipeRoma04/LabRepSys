# Supabase

La configuración inicial se creó con `npx supabase init`. Este proyecto usa Supabase alojado y no necesita Docker.

## Aplicar migraciones

1. Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el entorno local como se describe en el README de la raíz.
2. Inicia sesión en la CLI y vincula el proyecto:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```

3. Aplica las migraciones y el seed:

   ```bash
   npx supabase db push
   ```

Alternativamente, copia el SQL de los archivos de `migrations/` en orden al SQL Editor de Supabase y ejecútalo. Después ejecuta `seed.sql`. La migración `20261017030000_catalogs.sql` crea los catálogos compartidos, `20261017140000_clients_quotes.sql` crea clientes, contactos y cotizaciones, y `20261017150000_samples_reception.sql` crea muestras y recepción. `seed.catalogs.development.sql` contiene únicamente nombres de laboratorios para pruebas locales y **no** se ejecuta automáticamente ni debe cargarse en producción.

## Usuarios, Auth y primer ADMIN

En Supabase Dashboard, ve a **Authentication > Providers > Email** y desactiva **Allow new users to sign up**. Crea usuarios por invitación desde **Authentication > Users > Invite user**. El trigger SQL crea cada perfil inactivo; un administrador activo debe activarlo y asignarle roles.

Para el primer administrador, crea/invita primero la cuenta desde el Dashboard y ejecuta en el SQL Editor, sustituyendo el UUID por el `id` real que aparece en **Authentication > Users**:

```sql
update public.profiles
set active = true
where id = '<UUID_DEL_USUARIO>'::uuid;

insert into public.user_roles (user_id, role_code, assigned_by)
values (
  '<UUID_DEL_USUARIO>'::uuid,
  'ADMIN',
  '<UUID_DEL_USUARIO>'::uuid
);
```

Este bootstrap se ejecuta desde el SQL Editor con privilegios de proyecto; no habilita autoasignación desde la aplicación. No incluyas usuarios ni contraseñas en `seed.sql`.

## Storage privado y descargas

La migración crea los buckets privados `source-files`, `report-drafts`, `issued-reports` y `signatures`. No se concede lectura directa de `storage.objects`: las descargas de la aplicación deben solicitar una URL firmada mediante la Edge Function `create-storage-signed-url`, con vencimiento fijo de 60 segundos. La clave privilegiada se configura únicamente como secreto de la Edge Function y nunca en el frontend.

La política inicial es deliberadamente restrictiva mientras no existan las tablas de muestras y reportes que permitan comprobar propiedad y estado:

- `source-files`: las escrituras de `ADMIN` y `RECEPCION` solo aceptan la forma `samples/{sample_uuid}/{file_uuid}-{nombre}`. La lectura firmada está permitida a los roles activos `ADMIN`, `RECEPCION`, `ANALISTA`, `JEFE_TECNICA_CALIDAD` y `AUDITOR`. La escritura de otros roles queda denegada hasta poder comprobar en base de datos la entidad, la asignación y su estado.
- `report-drafts`, `issued-reports` y `signatures`: las escrituras quedan limitadas a `ADMIN`; para emitir enlaces firmados, la política temporal permite solo a `ADMIN`. La estructura de rutas y acceso por estado/propiedad se definirá junto con los módulos de reportes.
- Usuarios no activos o sin rol funcional no pueden generar descargas. Los objetos de todos los buckets permanecen privados.

No se definió una matriz completa de rutas/roles para borradores, reportes emitidos y firmas; no se habilita acceso amplio como sustituto. Cada módulo deberá ampliar estas reglas en una nueva migración y validar la relación del objeto con la entidad y el estado correspondiente antes de conceder acceso.

## Catálogos

La migración de catálogos crea matrices, métodos, laboratorios, acreditaciones y su alcance por ensayo, ensayos, alias, grupos de ensayos, plantillas y festivos. Todas las tablas tienen RLS: usuarios activos pueden consultar registros activos; ADMIN puede consultar también inactivos y crear/editar/activar/inactivar registros. No se concede hard delete. Los cambios se escriben en `audit_logs`. También corrige la ambigüedad de nombres de parámetros que impedía ejecutar `next_counter` en PostgreSQL.

Los códigos vigentes de ensayo deben comenzar con `SA`. AGQ, CHEM y SGI son valores de `test_aliases` con tipo `LEGACY_CODE`, nunca códigos vigentes. La vista `v_test_execution_classification` deriva SA acreditado, SA no acreditado o subcontratado a partir del laboratorio y su acreditación vigente con alcance para el ensayo. `v_tests_issuable` enumera los campos faltantes; `FALTA INFO` se considera faltante. Un ensayo incompleto se conserva, pero no se marca emitible.

Los campos técnicos de un ensayo no se pueden actualizar directamente. ADMIN crea una nueva versión con `create_test_version`; la función vincula la versión anterior y cierra su vigencia en la misma transacción. Las acreditaciones, métodos, LCM y parámetros no se precargan ni se infieren. La importación CSV acepta encabezados con nombres de columnas SQL; rechaza cada fila inválida y presenta su número y error.

Las plantillas se versionan mediante `(code, version)`. No se presupone una versión oficial. `holidays` es solo un catálogo; no se calculan plazos con sus datos mientras DP-014 siga pendiente.

Para poblar laboratorios de prueba en una base local, ejecuta manualmente `seed.catalogs.development.sql` después de las migraciones. No agregues ese archivo a `db.seed.sql_paths` ni lo ejecutes en producción.

El editor de plantillas guarda logos y firmas en el bucket privado `template-assets`. Solo ADMIN puede subir archivos; no se permite lectura directa desde Storage ni se crean URLs públicas. La descarga de esos assets queda pendiente de integrarse con un flujo de URL firmada de corta duración o con el procesamiento server-side del PDF.

## Clientes, contactos y cotizaciones

`clients` y `contacts` son legibles por usuarios activos; ADMIN y COMERCIAL pueden crearlos, editarlos y activarlos/inactivarlos. No se concede hard delete. El NIT se hace único cuando no está vacío, y `find_similar_clients` usa pg_trgm para devolver coincidencias como advertencias, no como bloqueos. `quotes` y sus líneas se leen por ADMIN/COMERCIAL en todos los estados y por los demás usuarios activos solo en estado `ACTIVE`.

Las cotizaciones se guardan mediante `save_quote` en una transacción. La función genera el código usando `next_counter('COT', año)` y el formato `document.format.COT` de `app_settings`; conserva los ensayos y las normativas acordadas, y exige confirmación posterior para cada normativa. Una clave foránea compuesta impide asociar a una cotización un contacto de otro cliente. `set_quote_status` audita cambios de estado. Para recepción, consultar únicamente cotizaciones activas con estado `ACTIVE` y `valid_until` nulo o no anterior a la fecha operativa.

## Muestras y recepción

La migración crea `samples`, `sample_receptions`, `sample_tests` y `sample_events`, todas con RLS. Solo ADMIN y RECEPCION pueden crear o editar mediante `save_sample`; las escrituras directas están revocadas. ANALISTA, MUESTREO, JEFE_TECNICA_CALIDAD y AUDITOR, además de RECEPCION y ADMIN, pueden leer. `sample.code_pattern` controla la expresión regular del código (valor inicial `^AG[0-9]{4}$`); las muestras ya existentes conservan sus códigos y el índice único impide duplicados. No se implementan prefijos por matriz ni reinicio anual, pendientes de DP-032.

`save_sample` exige confirmación explícita de sugerencias de cotización, verificación de capacidad y métodos, consulta al cliente cuando exista desviación, laboratorio asignado para cada ensayo subcontratado y motivo obligatorio para toda edición posterior. La RPC actualiza la muestra, recepción y ensayos en una transacción, registra valores anteriores/nuevos en `audit_logs` y agrega eventos al historial. Una muestra importada desde CSV queda `PENDING_REVIEW` hasta que se complete y guarde la revisión en el asistente.

La importación CSV requiere código, cliente (NIT o razón social) y matriz (código o nombre); acepta además plan, punto y fecha. La vista previa señala código inválido, cliente o matriz no encontrados y fechas futuras o con año distinto, sin corregir fechas automáticamente. Las filas inválidas se excluyen y las advertencias permanecen para revisión. La búsqueda usa filtros combinables de texto, estado y fecha de recepción. Los bloques de datos de campo y adjuntos indican que estarán disponibles en el módulo siguiente.
