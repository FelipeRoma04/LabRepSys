# ReportSysDev

Andamiaje de la aplicación web de reportes de resultados de laboratorio. La interfaz se publica como sitio estático; Supabase es el único backend previsto. Los módulos funcionales, las tablas de negocio y la autenticación quedan pendientes de sus definiciones.

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
2. Autentica la CLI si aún no lo hiciste y vincula el proyecto:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```

3. Cuando existan migraciones, súbelas al proyecto vinculado:

   ```bash
   npx supabase db push
   ```

   `supabase/migrations/` no contiene todavía tablas de negocio.

Como alternativa, abre el **SQL Editor** del dashboard de Supabase y pega allí el contenido de cada migración en orden por nombre de archivo. Revisa el SQL antes de ejecutarlo. El archivo `supabase/seed.sql` se mantiene vacío por ahora.

## Publicación en GitHub Pages

El workflow `.github/workflows/deploy.yml` compila y publica el sitio en GitHub Pages al actualizar la rama `main` o al iniciarse manualmente.

1. En el repositorio, crea las variables **Settings > Secrets and variables > Actions > Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. En **Settings > Pages > Build and deployment > Source**, selecciona **GitHub Actions**.
3. Publica cambios en `main` o ejecuta el workflow desde la pestaña **Actions**.

El workflow establece automáticamente `VITE_BASE_PATH` en `/<nombre-del-repositorio>/`. La aplicación usa `HashRouter`, por lo que no necesita un archivo `404.html`.
