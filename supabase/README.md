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

Alternativamente, copia el SQL de los archivos de `migrations/` en orden al SQL Editor de Supabase y ejecútalo. Después ejecuta `seed.sql`. La carpeta `migrations/` contiene únicamente las tablas comunes de seguridad y datos compartidos; no se definen tablas de módulos funcionales todavía.

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
