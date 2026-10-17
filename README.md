# ReportSysDev

Aplicación web de reportes de resultados de laboratorio. La interfaz se publica como sitio estático; Supabase es el único backend. La autenticación, los catálogos y los módulos comerciales están implementados sobre migraciones y servicios Supabase.

## Requisitos

- Node.js LTS
- npm (incluido con Node.js)

## Instalación y ejecución

```bash
npm ci
npm run dev
```

## Variables de entorno

Copia `.env.example` a `.env.local` y completa las variables cuando haya un proyecto Supabase:

| Variable | Descripción |
| --- | --- |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anon del proyecto Supabase |
| `VITE_BASE_PATH` | Base de publicación de Vite; `/` para raíz o `/nombre-repositorio/` para GitHub Pages |

La clave anon está diseñada para uso en el cliente. No pongas claves `service_role`, contraseñas ni otros secretos en variables `VITE_*` ni en el repositorio. Si falta la URL o la clave anon, el cliente compartido de Supabase exporta `null`.

## Scripts

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Verificación TypeScript y compilación de producción |
| `npm run lint` | ESLint |
| `npm test` | Pruebas unitarias con Vitest |
| `npm run preview` | Vista previa de la compilación |

## Supabase

La configuración de Supabase está en `supabase/`. No se requiere Docker para trabajar contra el proyecto alojado en Supabase; no se incluye un flujo local con contenedores.

1. Crea o selecciona un proyecto en Supabase y copia su URL y clave anon a `.env.local`.
2. Desactiva el registro público en **Authentication > Providers > Email > Allow new users to sign up**. Crea usuarios mediante invitación desde **Authentication > Users**.
3. Autentica la CLI si aún no lo hiciste, vincula el proyecto y aplica las migraciones:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

4. Publica la función de descarga firmada:

   ```bash
   npx supabase functions deploy create-storage-signed-url
   ```

5. En las variables/secrets del proyecto Edge Function verifica que existan `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Son configuración exclusiva del entorno Supabase; nunca se copian a variables `VITE_*`.

Para crear el primer ADMIN, invita primero al usuario, toma su UUID desde **Authentication > Users** y ejecuta en el SQL Editor:

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

Como alternativa a `npx supabase db push`, ejecuta los SQL de `supabase/migrations/` en orden en el SQL Editor y luego el contenido de `supabase/seed.sql`. Las reglas actuales de Storage y sus decisiones pendientes están descritas en [supabase/README.md](./supabase/README.md).

## Clientes y cotizaciones

El módulo comercial permite gestionar clientes, contactos y cotizaciones con datos persistidos en Supabase. Clientes y cotizaciones se auditan; los NIT se mantienen únicos cuando tienen valor. Las razones sociales similares generan una advertencia que puede confirmarse. Las cotizaciones guardan ensayos y normativa como sugerencias pendientes de confirmación; los roles distintos de ADMIN y COMERCIAL solo pueden leer cotizaciones vigentes. Recepción debe consultar cotizaciones con estado `ACTIVE` y vigencia no vencida; `listSelectableQuotes` aplica ese filtro.

## Recepción de muestras

El asistente `/muestras/recepcion` registra muestras y recepción; `/muestras` y `/muestras/buscar` permiten filtrar y consultar el detalle. El código predeterminado es `^AG[0-9]{4}$` (configurable en `app_settings.sample.code_pattern`), se valida en navegador y base de datos, y es único. Las cotizaciones se muestran solo si están vigentes y las sugerencias de ensayos/normativa requieren confirmación explícita. Las desviaciones exigen constancia de consulta al cliente; las ediciones posteriores requieren motivo y se guardan mediante RPC con auditoría. CSV presenta vista previa y errores por fila antes de importar; las muestras importadas quedan pendientes de revisión hasta completar el asistente.

`/muestras/datos-de-campo` registra coordenadas originales, normalización decimal solo cuando el formato es inequívoco, mediciones con estados diferenciados y adjuntos privados. MUESTREO registra datos de campo; después de la recepción la RPC exige motivo y audita el cambio. RECEPCION y ADMIN gestionan adjuntos; las descargas requieren una URL firmada de 60 segundos. El tamaño máximo y la habilitación de fotos se configuran en `app_settings`.

## Publicación en GitHub Pages

El workflow `.github/workflows/deploy.yml` compila y publica el sitio en GitHub Pages al actualizar la rama `main` o al iniciarse manualmente.

1. En el repositorio, crea las variables **Settings > Secrets and variables > Actions > Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. En **Settings > Pages > Build and deployment > Source**, selecciona **GitHub Actions**.
3. Publica cambios en `main` o ejecuta el workflow desde la pestaña **Actions**.

El workflow establece automáticamente `VITE_BASE_PATH` en `/<nombre-del-repositorio>/`. La aplicación usa `HashRouter`, por lo que no necesita un archivo `404.html`.
