# Guía de Despliegue — LabRepSys

> **Última revisión:** 2026-10-17  
> **Rama:** `feature/a07-cicd`

---

## Advertencias importantes antes de continuar

> [!WARNING]
> **El `anon key` de Supabase es público por diseño.** Se incrusta en el bundle de producción y cualquier persona que visite el sitio puede inspeccionarlo. Está diseñado para eso; las políticas de RLS son la única capa de autorización. **Nunca pongas `service_role`, contraseñas de base de datos ni tokens de acceso en variables `VITE_*`.**

> [!WARNING]
> **GitHub Pages gratuito exige repositorio público.** Esto significa que el código fuente (incluyendo el `anon key` en el bundle) es visible. Los datos de clientes y resultados de laboratorio están protegidos por Supabase RLS, no por la visibilidad del código. Evalúa si un repositorio privado (GitHub Team/Enterprise o Pages con dominio personalizado) es necesario para tu caso.

> [!CAUTION]
> **Los planes gratuitos de Supabase se pausan tras períodos de inactividad** (7 días en el plan Free). Revisa el plan contratado y configura alertas. Los respaldos automáticos en el plan Free son limitados; consulta el [plan de respaldo](./RESPALDO.md).

> [!CAUTION]
> **Región de Supabase.** Los datos de clientes y resultados de laboratorio pueden estar sujetos a regulaciones de localización de datos. Verifica con tu asesor legal que la región seleccionada (`us-east-1`, `sa-east-1`, etc.) es aceptable antes del primer despliegue con datos reales.

---

## Requisitos previos

| Herramienta | Versión mínima | Notas |
|-------------|---------------|-------|
| Node.js | LTS (actualmente v24) | Usar `nvm` o `fnm` para fijar versión |
| npm | Incluido con Node.js | `npm ci` para reproducibilidad |
| Supabase CLI | Última estable | `npx supabase` o instalación global |
| Git | Cualquier reciente | — |

---

## Configuración de Supabase (una sola vez)

### 1. Crear o seleccionar proyecto

1. Ve a [supabase.com/dashboard](https://supabase.com/dashboard) y crea un proyecto.
2. Copia la **URL del proyecto** y la **clave `anon`** desde **Settings → API**.
3. Elige la región apropiada para tus datos.

### 2. Desactivar registro público

En el dashboard: **Authentication → Providers → Email → Allow new users to sign up** → **OFF**.  
Crea usuarios únicamente desde **Authentication → Users → Invite user**.

### 3. Aplicar migraciones

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Alternativa manual: ejecuta los archivos de `supabase/migrations/` en orden en el **SQL Editor** del dashboard, luego `supabase/seed.sql`.

### 4. Crear el primer ADMIN

Invita primero al usuario desde el dashboard. Toma su UUID desde **Authentication → Users** y ejecuta en el SQL Editor:

```sql
UPDATE public.profiles
SET active = true
WHERE id = '<UUID_DEL_USUARIO>'::uuid;

INSERT INTO public.user_roles (user_id, role_code, assigned_by)
VALUES (
  '<UUID_DEL_USUARIO>'::uuid,
  'ADMIN',
  '<UUID_DEL_USUARIO>'::uuid
);
```

### 5. Desplegar Edge Functions

```bash
npx supabase functions deploy create-storage-signed-url
```

Verifica que los secretos `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` existan en **Edge Functions → Secrets** del dashboard. **La `service_role` solo vive ahí, nunca en el frontend ni en este repositorio.**

---

## Despliegue en GitHub Pages

### Configuración del repositorio (una sola vez)

1. **Variables de Actions** (no Secrets — son públicas por diseño):  
   **Settings → Secrets and variables → Actions → Variables → New repository variable**
   - `VITE_SUPABASE_URL` → URL del proyecto Supabase
   - `VITE_SUPABASE_ANON_KEY` → Clave anon del proyecto

2. **Fuente de Pages**:  
   **Settings → Pages → Build and deployment → Source → GitHub Actions**

3. **Permisos del workflow** (si se requiere):  
   **Settings → Actions → General → Workflow permissions → Read and write permissions**

### Despliegue automático

El workflow `deploy.yml` se ejecuta automáticamente al hacer push a `main`. También puedes dispararlo manualmente desde **Actions → Publicar en GitHub Pages → Run workflow**.

El workflow:
1. Instala dependencias (`npm ci`)
2. Ejecuta typecheck y pruebas unitarias
3. Compila con `VITE_BASE_PATH=/<nombre-repo>/`
4. Verifica que `service_role` no aparece en el bundle
5. Publica en GitHub Pages

---

## Integración continua (CI)

El workflow `ci.yml` se ejecuta en cada Pull Request y push a `main`:

| Paso | Falla si... |
|------|-------------|
| ESLint | Hay errores de lint |
| TypeScript typecheck | Hay errores de tipos |
| Vitest | Alguna prueba falla |
| Build | La compilación falla |
| Verificación bundle | `service_role` aparece en `dist/` |
| npm audit | Hay vulnerabilidades de nivel **alto** o **crítico** |
| Gitleaks | Se detecta algún secreto en el historial de git |
| Validación SQL | Alguna migración falla o hay tablas sin RLS |

> [!TIP]
> Para ejecutar el CI localmente antes de hacer push:
> ```bash
> npm run lint
> npx tsc --noEmit
> npm test
> npm run build
> npm audit --audit-level=high
> ```

---

## Despliegue local (desarrollo)

```bash
# 1. Clonar y configurar
git clone <url-del-repo>
cd LabRepSys
cp .env.example .env.local
# Editar .env.local con URL y anon key de tu proyecto Supabase

# 2. Instalar y arrancar
npm ci
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`.

---

## Variables de entorno

| Variable | Dónde va | Descripción |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | `.env.local` / GitHub Variable | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` / GitHub Variable | Clave pública anon |
| `VITE_BASE_PATH` | Solo build | `/` local, `/<repo>/` en GitHub Pages |
| `SUPABASE_ACCESS_TOKEN` | Solo `scripts/ops/backup.sh` | Token personal de Supabase CLI (local) |
| `SUPABASE_PROJECT_REF` | Solo `scripts/ops/backup.sh` | Referencia del proyecto Supabase |

> [!CAUTION]
> Las variables `SUPABASE_ACCESS_TOKEN` y `SUPABASE_PROJECT_REF` son para uso local en operaciones de mantenimiento. **Nunca las configures como GitHub Secrets disponibles para workflows de CI/CD automatizados** sin revisión de seguridad adicional.

---

## Rollback

Si un despliegue falla o introduce una regresión:

1. Identifica el SHA del último commit funcional:  
   `git log --oneline main`
2. Revierte el merge o el commit problemático:  
   `git revert <sha> --no-edit && git push origin main`
3. El workflow de deploy se disparará automáticamente con el revert.
4. Para migraciones SQL: **nunca edites una migración ya aplicada**. Crea una nueva migración de corrección.

---

## Verificación post-despliegue

- [ ] La URL de GitHub Pages carga el login sin errores de consola
- [ ] El login con un usuario ADMIN funciona
- [ ] Las rutas protegidas redirigen a `/login` si no hay sesión
- [ ] `service_role` no aparece en el bundle: `curl <url-pages> | grep service_role` (debe estar vacío)
- [ ] Las Edge Functions están desplegadas y responden (probar descarga firmada)
