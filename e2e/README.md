# Pruebas E2E — LabRepSys (A03)

Pruebas de extremo a extremo con [Playwright](https://playwright.dev/).  
Cubren el flujo completo del LAA: login → catálogos → recepción → resultados → conciliación → borrador RSA → revisión → emisión → auditoría.

---

## Requisitos previos

1. **Node.js ≥ 18** y el proyecto instalado (`npm ci`).
2. **Navegadores de Playwright** instalados:
   ```bash
   npx playwright install chromium firefox
   ```
3. **Un proyecto Supabase de prueba** (nunca el de producción).  
   Debe tener aplicadas todas las migraciones y los seeds:
   ```bash
   npx supabase link --project-ref <TEST_PROJECT_REF>
   npx supabase db push
   # Aplicar seeds de catálogos (seed-phase1):
   psql "<CONNECTION_STRING>" -f supabase/seed.sql
   psql "<CONNECTION_STRING>" -f supabase/seed/01_catalogs.sql
   psql "<CONNECTION_STRING>" -f supabase/seed/02_tests_aliases.sql
   psql "<CONNECTION_STRING>" -f supabase/seed/03_holidays_co_2026_2027.sql
   # Seed E2E (clientes y muestras de prueba):
   psql "<CONNECTION_STRING>" -f e2e/fixtures/seed-e2e.sql
   ```
4. **Usuarios de prueba** creados en Supabase Auth del proyecto de prueba, con los roles correspondientes (ver tabla más abajo).
5. **Archivo `.env.e2e`** en la raíz del proyecto (nunca commitear):
   ```
   E2E_BASE_URL=http://localhost:5173
   E2E_SUPABASE_URL=https://<TEST_REF>.supabase.co
   E2E_SUPABASE_ANON_KEY=<anon-key-del-proyecto-de-prueba>

   E2E_ADMIN_EMAIL=admin@labrepsys.test
   E2E_ADMIN_PASSWORD=<contraseña>
   E2E_ANALISTA_EMAIL=analista@labrepsys.test
   E2E_ANALISTA_PASSWORD=<contraseña>
   E2E_JTC_EMAIL=jtc@labrepsys.test
   E2E_JTC_PASSWORD=<contraseña>
   E2E_RECEPCION_EMAIL=recepcion@labrepsys.test
   E2E_RECEPCION_PASSWORD=<contraseña>
   E2E_AUDITOR_EMAIL=auditor@labrepsys.test
   E2E_AUDITOR_PASSWORD=<contraseña>

   # Completar tras ejecutar seed-e2e.sql (seed fase 2):
   E2E_DEMO_CLIENT_ID=PENDING
   E2E_DEMO_CONTACT_ID=PENDING
   E2E_DEMO_QUOTE_ID=PENDING
   ```

---

## Usuarios de prueba requeridos

| Variable de rol | Rol en el sistema | Puede crear en DB |
|----------------|------------------|------------------|
| `E2E_ADMIN_EMAIL` | ADMIN | Sí |
| `E2E_ANALISTA_EMAIL` | ANALISTA | Sí |
| `E2E_JTC_EMAIL` | JEFE_TECNICA_CALIDAD | Sí |
| `E2E_RECEPCION_EMAIL` | RECEPCION | Sí |
| `E2E_AUDITOR_EMAIL` | AUDITOR | Solo lectura |

Crear los usuarios en Supabase Auth Dashboard → Authentication → Users → Invite.  
Luego activarlos en la tabla `public.profiles` y asignarles el rol en `public.user_roles`.

---

## Ejecutar las pruebas

```bash
# Cargar variables de entorno y ejecutar todas las pruebas
npx dotenv -e .env.e2e -- npm run e2e

# O exportar manualmente y luego:
npm run e2e

# Solo un archivo:
npx playwright test e2e/01-login.spec.ts

# Modo UI interactivo:
npm run e2e:ui

# Ver el reporte HTML:
npm run e2e:report
```

---

## Estructura de archivos

```
e2e/
  README.md              — este archivo
  helpers/
    auth.ts              — helpers de autenticación (signIn / signOut)
    demo-data.ts         — IDs y constantes de datos de prueba
    wait.ts              — helpers de espera de carga y notificaciones
  fixtures/
    seed-e2e.sql         — seed de datos demo (cliente, contacto, cotización)
  01-login.spec.ts       — login, logout, control de acceso
  02-catalogos.spec.ts   — catálogos sembrados en seed-phase1
  03-recepcion.spec.ts   — asistente de recepción de muestras (8 pasos)
  04-resultados.spec.ts  — carga de resultados por pegado y archivo
  05-conciliacion.spec.ts — conciliación de inconsistencias
  06-rsa-borrador.spec.ts — constructor RSA: nuevo borrador
  07-rsa-revision.spec.ts — flujo de revisión y aprobación
  08-rsa-emision.spec.ts  — emisión, snapshot e inmutabilidad
  09-auditoria-storage.spec.ts — auditoría y URLs firmadas de Storage
```

---

## Estado actual

| Spec | Estado | Bloqueo |
|------|--------|---------|
| 01-login | ✅ Listo para ejecutar | Requiere variables de env |
| 02-catalogos | ✅ Listo para ejecutar | Requiere seed-phase1 aplicado |
| 03-recepcion | ⚠️ Parcial | Prueba de flujo completo espera seed-phase2 (`E2E_DEMO_CLIENT_ID`) |
| 04-resultados | ⚠️ Parcial | Prueba de importación real espera seed-phase2 |
| 05-conciliacion | ✅ Listo para ejecutar | Solo requiere acceso al módulo |
| 06-rsa-borrador | ⚠️ Parcial | Crear borrador real espera seed-phase2 |
| 07-rsa-revision | ⚠️ Parcial | Flujo completo espera seed-phase2 + reporte DRAFT |
| 08-rsa-emision | ⚠️ Parcial | Emisión real espera seed-phase2 + reporte APPROVED |
| 09-auditoria-storage | ✅ Listo para ejecutar | Requiere variables de env |

Las pruebas marcadas como ⚠️ tienen una sección ejecutable hoy (que verifica acceso y carga de UI) y una sección `test.skip` que se activa automáticamente cuando `E2E_DEMO_CLIENT_ID=PENDING`. Una vez que seed-phase2 esté disponible, solo hay que completar las variables de entorno y los IDs en `e2e/helpers/demo-data.ts`.

---

## Limpieza post-prueba

Después de cada ciclo de pruebas completo, eliminar los registros DEMO del proyecto de prueba:

```sql
-- Ejecutar en el proyecto de PRUEBA únicamente
DELETE FROM public.samples WHERE code = 'AG9901';
DELETE FROM public.clients WHERE business_name = 'Cliente Demo E2E';
-- Los registros de auditoría y reportes se eliminan en cascada o manualmente según políticas.
```

No ejecutar contra producción.
