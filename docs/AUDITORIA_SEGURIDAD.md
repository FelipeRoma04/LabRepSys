# Auditoría de Seguridad — LabRepSys

> **Fecha:** 2026-11-20 (revisión estática) · 2026-11-23 (verificación sobre la base de datos; ver «Revisión del 2026-11-23»)  
> **Alcance:** 26 migraciones SQL (`supabase/migrations/`), código cliente (`src/lib/`, `src/services/`), Edge Function `create-storage-signed-url`.  
> **Método:** Revisión estática de código (solo lectura). No se ejecutaron consultas contra ningún proyecto de Supabase.  
> **Convención de severidad:**  
> - 🔴 **ALTA** — riesgo de acceso no autorizado a datos, escalada de privilegios o filtración entre usuarios.  
> - 🟡 **MEDIA** — control presente pero con brechas que un atacante podría aprovechar en condiciones específicas.  
> - 🟢 **BAJA** — mejora de defensa en profundidad; sin explotación directa probable.  
> - ℹ️ **INFO** — observación positiva o contexto relevante sin hallazgo de riesgo.

---

## Resumen ejecutivo

La base de seguridad del sistema es **sólida**: todas las tablas tienen RLS activo, ninguna política usa `USING (true)` ni `WITH CHECK (true)` sin restricción de rol, la clave `service_role` nunca aparece en el código cliente, y el acceso a Storage se centraliza en una Edge Function que valida JWT, rol y existencia del objeto antes de generar URLs firmadas de 60 segundos.

Se identificaron **8 hallazgos**, ninguno de severidad crítica. Los de mayor impacto son la ausencia de `FORCE ROW LEVEL SECURITY` en todas las tablas (H-01), el acceso excesivamente amplio a la tabla `clients` para roles sin relación comercial (H-02), y la fuga de estadísticas agregadas en `get_dashboard_summary` para cualquier usuario activo (H-05).

| ID | Severidad | Resumen |
|----|-----------|---------|
| H-01 | 🟡 MEDIA | Ninguna tabla usa `FORCE ROW LEVEL SECURITY` |
| H-02 | 🟡 MEDIA | `clients` y `contacts` legibles por todos los roles activos |
| H-03 | 🟡 MEDIA | `sample_regulations` legible por todos los roles activos |
| H-04 | 🟡 MEDIA | `sample_has_pending_external_reports` sin validación de rol (v1; corregido en migración posterior) |
| H-05 | 🟢 BAJA | `get_dashboard_summary` expone conteos agregados de muestras a cualquier usuario activo |
| H-06 | 🟢 BAJA | `notifications: insert` sin restricción de destinatario (ventana entre migraciones) |
| H-07 | 🟢 BAJA | `v_error_summary` y `v_denied_attempts` requieren ADMIN/ADMIN_TECNICO pero la vista no lo fuerza por sí misma |
| H-08 | 🟢 BAJA | `document_counters` y `excel_import_batches` sin políticas explícitas de SELECT |
| H-09 | ℹ️ INFO | `pending_decisions` legible por todos los roles activos |

---

## Revisión del 2026-11-23 (verificación sobre la base de datos)

> **Método:** a diferencia de la revisión del 2026-11-20, que fue estática, esta revisión **consulta el catálogo de PostgreSQL**. Se usó un Supabase local aislado con todas las migraciones de `feature/rsa-anulacion` (main + `feature/pruebas-db` + serie DEMO + `void_report`). Además se corrió `npm audit` y se revisó el bundle de producción. **No se corrigió nada**: cada hallazgo trae la corrección propuesta. No se consultó Supabase remoto.

### Resultado de las verificaciones automáticas

| Verificación | Resultado |
|---|---|
| Tablas de `public` sin RLS | **Ninguna** |
| Tablas con RLS sin `FORCE` | 62 (ya reportado en H-01) |
| Funciones `SECURITY DEFINER` sin `search_path` fijo | **Ninguna** (67 funciones) |
| `search_path` con esquemas escribibles por usuarios (`$user`, vacío) | **Ninguno** |
| Políticas `USING (true)` / `WITH CHECK (true)` | **Ninguna** |
| Vistas de `public` sin `security_invoker` | **Ninguna** |
| Buckets de Storage públicos | **Ninguno** (los 5 son privados) |
| Políticas DELETE sobre `storage.objects` | Ninguna: los archivos no se borran desde el cliente |
| `service_role` o claves secretas en el bundle (`dist/`) | **No aparecen** |
| Variables de entorno del cliente | Solo `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_BASE_PATH` |
| `npm audit` | 2 moderadas, 0 altas, 0 críticas (ver N-06) |

### Hallazgos nuevos

| ID | Severidad | Resumen |
|----|-----------|---------|
| N-01 | 🟡 MEDIA | Seis funciones `SECURITY DEFINER` del flujo RSA son ejecutables por `anon` |
| N-02 | 🟡 MEDIA | `anon` y `authenticated` tienen TRUNCATE (y otros privilegios) sobre 28 tablas; TRUNCATE no pasa por RLS |
| N-03 | 🟡 MEDIA | Los privilegios por defecto del esquema `public` conceden todo a `anon` en cada tabla y función nueva |
| N-04 | 🟡 MEDIA | La app no declara Content-Security-Policy |
| N-05 | 🟢 BAJA | La Edge Function de descargas responde CORS a cualquier origen |
| N-06 | 🟢 BAJA | `exceljs` arrastra `uuid` con una vulnerabilidad moderada |
| N-07 | ℹ️ INFO | Errores de autorización y de integridad corregidos en ramas pendientes de fusionar |

#### N-01 🟡 MEDIA — Funciones del flujo RSA ejecutables por `anon`

`transition_report`, `issue_report`, `rectify_report`, `save_report_draft`, `add_report_comment` y `get_report_history` tienen `EXECUTE` para `anon`. Por eso se pueden llamar por RPC con la anon key **sin iniciar sesión**. Hoy cada función rechaza la llamada porque no hay usuario activo. Por ejemplo, `transition_report` termina en `log_audit` con «Usuario activo requerido». Sin embargo, la protección depende por completo de la lógica interna, y cualquier cambio futuro que olvide esa validación quedaría expuesto.

Las funciones más nuevas sí revocan el acceso (`revoke … from public, anon`), por ejemplo `void_report`, `learn_test_alias` y las de conciliación.

**Corrección propuesta**, en una migración nueva (firmas verificadas en la base local):

```sql
revoke execute on function
  public.transition_report(uuid, text, text),
  public.issue_report(uuid),
  public.rectify_report(uuid, text),
  public.save_report_draft(uuid, uuid, uuid, uuid, uuid[], uuid[]),
  public.add_report_comment(uuid, text, uuid, text),
  public.get_report_history(uuid)
from public, anon;
```

Además conviene una prueba pgTAP que falle si alguna función `SECURITY DEFINER` de `public` queda ejecutable por `anon`.

#### N-02 🟡 MEDIA — TRUNCATE y otros privilegios de más sobre 28 tablas

`anon` y `authenticated` tienen `TRUNCATE`, `REFERENCES` y `TRIGGER` (y en varias tablas también `INSERT`, `UPDATE` y `DELETE`) sobre 28 tablas y vistas. Entre ellas están `results`, `reports`, `report_snapshots`, `regulations`, `regulation_limits`, `validation_rules` e `import_rows`.

RLS protege SELECT, INSERT, UPDATE y DELETE, pero **TRUNCATE no pasa por RLS**. Hoy no es explotable: PostgREST y GraphQL no exponen TRUNCATE y los clientes no tienen SQL directo. Aun así, es la única barrera, y bastaría una vía de SQL dinámico para vaciar una tabla completa.

En cambio, las tablas de catálogos sí revocan todo y vuelven a conceder solo lo necesario.

**Corrección propuesta:**

```sql
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, references, trigger on %I.%I from anon, authenticated', t.schemaname, t.tablename);
    execute format('revoke all on %I.%I from anon', t.schemaname, t.tablename);
  end loop;
end $$;
```

Revocar todo a `anon` es seguro porque ninguna política concede acceso a `anon`. Para `authenticated` se mantienen los privilegios de datos que cubren las políticas.

#### N-03 🟡 MEDIA — Privilegios por defecto demasiado amplios

`pg_default_acl` del esquema `public` concede `arwdDxtm` (todo) a `anon` y `authenticated` en cada tabla nueva, y `EXECUTE` en cada función nueva. Esta es la causa raíz de N-01 y N-02: cada migración debe acordarse de revocar.

**Corrección propuesta**, aplicada con el mismo rol que crea los objetos en el proyecto remoto (`postgres`):

```sql
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
```

#### N-04 🟡 MEDIA — Sin Content-Security-Policy

`index.html` no declara CSP, y GitHub Pages no permite cabeceras HTTP propias. Una CSP por etiqueta `meta` limita el daño de un XSS: impide cargar scripts de terceros y enviar datos a otros dominios.

**Propuesta**, para validar en local antes de publicar, reemplazando `<proyecto>`:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://<proyecto>.supabase.co;
  connect-src 'self' https://<proyecto>.supabase.co wss://<proyecto>.supabase.co;
  worker-src 'self' blob:;
  frame-src 'self' blob: https://<proyecto>.supabase.co;
  object-src 'none'; base-uri 'self'; form-action 'self'">
```

- `style-src 'unsafe-inline'` hace falta por los atributos `style` de React.
- `worker-src blob:` lo necesita el worker de pdfjs.
- `frame-src` lo necesitan las vistas previas de PDF con URL firmada.
- `frame-ancestors` no funciona en `meta`, así que la protección contra clickjacking requiere un proxy o CDN que agregue la cabecera.

#### N-05 🟢 BAJA — CORS abierto en `create-storage-signed-url`

La función responde `Access-Control-Allow-Origin: *`. El riesgo es bajo porque exige un JWT válido, perfil activo y rol. Aun así, conviene limitar el origen al dominio de Pages (`https://<usuario>.github.io`) y a `http://localhost:5173` en desarrollo.

#### N-06 🟢 BAJA — `uuid` vulnerable vía `exceljs`

`npm audit` reporta 2 vulnerabilidades moderadas: `uuid` («Missing buffer bounds check in v3/v5/v6 when buf is provided»), que llega por `exceljs`. La app no pasa un `buf` a `uuid` y `exceljs` solo se usa para leer archivos que suben usuarios autenticados. `npm audit fix --force` propone un cambio mayor de `exceljs`.

**Recomendación:** aceptar el riesgo, documentarlo y revisarlo en cada PR de Dependabot. Si aparece una versión compatible de `exceljs`, actualizar.

#### N-07 ℹ️ INFO — Correcciones en ramas pendientes

Estas correcciones ya están hechas en ramas, pero **no están en `main` ni en producción**:

- `feature/pruebas-db` (migración `20261123110000`):
  - un usuario activo sin rol ya no lee catálogos;
  - se revocan UPDATE y DELETE a los clientes sobre las 8 tablas del reporte;
  - el trigger de estado de reportes solo bloquea los UPDATE directos de clientes.
- `feature/pruebas-db` también agrega las pruebas pgTAP al CI, para detectar regresiones de autorización.
- `feature/rsa-anulacion` agrega `void_report` con segregación de funciones y auditoría.

Hasta que se fusionen y se apliquen, producción conserva el comportamiento anterior.

### Prioridad sugerida

1. **N-01, N-02 y N-03 en una sola migración**, con una prueba pgTAP que verifique que `anon` no tiene `EXECUTE` sobre funciones `SECURITY DEFINER` ni `TRUNCATE` sobre tablas. Es bajo riesgo y cierra la causa raíz.
2. **N-04 (CSP)**: probar primero en local, con todas las pantallas, porque una CSP demasiado estricta puede romper la vista previa de PDF.
3. **N-05 y N-06** cuando se toque la Edge Function o se actualicen dependencias.

---

## 1. Cobertura de RLS

### 1.1 Inventario de tablas con RLS

Todas las tablas creadas en las 26 migraciones tienen `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` activo. No se encontró ninguna tabla sin RLS.

**Tablas por migración:**

| Migración | Tablas |
|-----------|--------|
| `20261017020000_security_shared_data.sql` | `profiles`, `roles`, `user_roles`, `app_settings`, `document_counters`, `audit_logs` |
| `20261017030000_catalogs.sql` | `matrices`, `methods`, `laboratories`, `laboratory_accreditations`, `laboratory_accredited_tests`, `tests`, `test_aliases`, `test_groups`, `test_group_members`, `report_templates`, `holidays` |
| `20261017040000_observability.sql` | `client_error_logs` |
| `20261017060000_field_data_attachments.sql` | `field_parameters`, `sample_field_data`, `sample_field_measurements`, `sample_attachments` |
| `20261017070000_external_shipments.sql` | `external_shipments`, `external_shipment_tests` |
| `20261017080000_results.sql` | `result_imports`, `import_rows`, `results`, `result_corrections` |
| `20261017090000_reconciliation.sql` | `reconciliation_issues`, `reconciliation_decisions` |
| `20261017100000_regulations.sql` | `regulations`, `regulation_versions`, `regulation_activities`, `regulation_limits`, `sample_regulations` |
| `20261017110000_validations.sql` | `validation_rules`, `validation_runs`, `validation_issues` |
| `20261017120000_rsa_reports.sql` | `reports`, `report_samples`, `report_results`, `report_regulation_columns`, `report_reviews`, `report_approvals`, `report_comments`, `report_snapshots`, `report_files`, `report_status_transitions`, `approval_deputies` |
| `20261017130000_notifications_admin.sql` | `notifications`, `pending_decisions` |
| `20261017140000_clients_quotes.sql` | `clients`, `contacts`, `quotes`, `quote_tests`, `quote_regulations` |
| `20261017150000_samples_reception.sql` | `samples`, `sample_receptions`, `sample_tests`, `sample_events` |
| `20261019150000_excel_import_batches.sql` | `excel_import_batches` |

### 1.2 Tablas sin políticas explícitas definidas

Las siguientes tablas tienen RLS activo y `REVOKE ALL FROM anon, authenticated`, pero no tienen ninguna política `SELECT/INSERT/UPDATE/DELETE` definida. El comportamiento predeterminado de Supabase con RLS activo y sin políticas es **denegar por defecto** (ningún usuario accede directamente), lo que es seguro. El acceso solo se realiza vía funciones `SECURITY DEFINER`.

| Tabla | Migración | Acceso real |
|-------|-----------|-------------|
| `document_counters` | `20261017020000` | Solo vía `next_counter()` SECURITY DEFINER |
| `excel_import_batches` | `20261019150000` | Solo vía `has_excel_import()` y `record_excel_import()` SECURITY DEFINER |

> Ver H-08.

---

## 2. Hallazgos

---

### H-01 🟡 MEDIA — Ausencia de `FORCE ROW LEVEL SECURITY` en todas las tablas

**Migración(es):** Todas (ninguna llama a `ALTER TABLE ... FORCE ROW LEVEL SECURITY`).

**Descripción:**  
Sin `FORCE ROW LEVEL SECURITY`, el rol propietario de la tabla (en Supabase, el superusuario `postgres`) y cualquier conexión directa con dicho rol (migraciones, seeds, scripts de mantenimiento, herramientas administrativas como `psql` contra la cadena de conexión de la base de datos) **bypasean silenciosamente todas las políticas RLS**. Las funciones `SECURITY DEFINER` también ejecutan como `postgres` y sortean RLS en las tablas que tocan.

Esto es una postura de defensa en profundidad: en producción solo las Edge Functions y las RPCs deben tener acceso, y ya tienen sus propias validaciones de rol. Sin embargo, si en el futuro alguien agrega un script de seed, una consulta de mantenimiento o una nueva Edge Function sin las mismas validaciones, obtendrá acceso irrestricto sin ninguna advertencia.

**Corrección propuesta:**  
Agregar `ALTER TABLE public.<nombre> FORCE ROW LEVEL SECURITY;` a todas las tablas en una migración dedicada. Las funciones `SECURITY DEFINER` existentes no se ven afectadas porque ya ejecutan como `postgres` y ese comportamiento se mantiene igual; lo que cambia es que una conexión directa como `postgres` ya no elude RLS.

```sql
-- Ejemplo de migración correctiva
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.samples FORCE ROW LEVEL SECURITY;
-- ... (repetir para cada tabla)
```

---

### H-02 🟡 MEDIA — `clients` y `contacts` legibles por todos los roles activos

**Migración:** `20261017140000_clients_quotes.sql`, políticas `clients_read_active_users` y `contacts_read_active_users`.

```sql
create policy clients_read_active_users on public.clients
  for select to authenticated using (public.current_user_is_active());

create policy contacts_read_active_users on public.contacts
  for select to authenticated using (public.current_user_is_active());
```

**Descripción:**  
Cualquier usuario activo —incluyendo MUESTREO, ANALISTA, RECEPCION, AUDITOR— puede leer todos los registros de clientes y contactos. Esto incluye campos potencialmente sensibles como NIT/RUT, dirección, notas de regulaciones preferidas y datos de contacto. No hay filtro por cliente asignado ni por rol.

En un sistema de laboratorio con múltiples clientes competidores, que un analista pueda ver la cartera completa de clientes (incluyendo cotizaciones) representa un riesgo de fuga de información comercial.

**Corrección propuesta:**  
Restringir la lectura a los roles que necesitan ver todos los clientes (ADMIN, COMERCIAL, RECEPCION) y para los demás roles (ANALISTA, MUESTREO) limitar a los clientes de las muestras asignadas:

```sql
-- Reemplaza clients_read_active_users
DROP POLICY clients_read_active_users ON public.clients;

-- Acceso completo solo para roles comerciales
CREATE POLICY clients_read_commercial ON public.clients
  FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['ADMIN', 'COMERCIAL', 'RECEPCION', 'JEFE_TECNICA_CALIDAD', 'AUDITOR']));

-- Analistas y muestreo solo ven clientes de sus muestras
CREATE POLICY clients_read_own_samples ON public.clients
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(ARRAY['ANALISTA', 'MUESTREO'])
    AND EXISTS (
      SELECT 1 FROM public.samples s WHERE s.client_id = id
      -- opcional: AND s.created_by = auth.uid()
    )
  );
```

> Ajustar con la decisión de si ANALISTA ve todas las muestras o solo las propias (DP-pendiente).

---

### H-03 🟡 MEDIA — `sample_regulations` legible por todos los roles activos

**Migración:** `20261017100000_regulations.sql`, política `"sample_regs: read"`.

```sql
create policy "sample_regs: read" on public.sample_regulations
  for select to authenticated using (public.current_user_is_active());
```

**Descripción:**  
La tabla `sample_regulations` vincula muestras con regulaciones y versiones normativas específicas. Cualquier usuario activo puede leer esta asociación, lo que revela qué análisis normativos se hacen para qué muestras y, por extensión, para qué clientes. Este dato es parte del historial técnico del laboratorio y puede tener valor comercial o regulatorio.

**Corrección propuesta:**  
Restringir a los roles que trabajan con muestras directamente (RECEPCION, ANALISTA, JTC, AUDITOR, ADMIN) o bien limitar a las muestras visibles para el usuario (complementa H-02):

```sql
DROP POLICY "sample_regs: read" ON public.sample_regulations;
CREATE POLICY "sample_regs: read_authorized" ON public.sample_regulations
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(ARRAY['ADMIN', 'JEFE_TECNICA_CALIDAD', 'ANALISTA', 'RECEPCION', 'AUDITOR'])
    AND public.current_user_is_active()
  );
```

---

### H-04 🟡 MEDIA — `sample_has_pending_external_reports` sin validación de rol (versión inicial)

**Migración:** `20261017070000_external_shipments.sql` (primera versión); corregido en `20261019100000_external_shipments_workflow.sql`.

**Descripción:**  
La versión original de esta función `SECURITY DEFINER` verificaba solo la existencia de envíos externos para un `sample_id` dado sin validar el rol del llamador. Cualquier usuario autenticado activo podía llamarla y determinar si una muestra específica tenía envíos externos pendientes, lo que revela información de procesamiento sin autorización de rol.

La migración `20261019100000` corrige esto añadiendo `has_any_role(...)` antes de la consulta.

**Estado:** Corregido en producción si las migraciones se aplican en orden. El riesgo existe si hay un proyecto que ejecutó solo hasta `20261017070000`.

**Corrección propuesta:**  
Verificar que todos los entornos (staging, pruebas, demo) tienen aplicada la migración `20261019100000`. Agregar un test pgTAP que verifique que la función exige un rol válido.

---

### H-05 🟢 BAJA — `get_dashboard_summary` expone conteos de muestras a cualquier usuario activo

**Migración:** `20261019170000_admin_notifications_audit.sql`.

**Descripción:**  
La función `get_dashboard_summary(timestamptz)` es `SECURITY DEFINER` y devuelve, entre otras cosas, `samples_received` y `samples_pending` consultando `SELECT count(*) FROM public.samples`. Estos conteos globales son accesibles para cualquier usuario activo (la función solo comprueba `current_user_is_active()`).

Esto expone el volumen operativo total del laboratorio (número de muestras en el sistema) a roles como MUESTREO o COMERCIAL que no deberían necesitarlo. Es información agregada, no datos de clientes, por lo que el riesgo es bajo.

**Corrección propuesta:**  
Agregar un filtro de rol para las secciones de conteo de muestras, o exponer solo los datos estadísticos pertinentes a cada rol:

```sql
-- Dentro de get_dashboard_summary, antes del SELECT count(*) FROM samples:
IF public.has_any_role(ARRAY['ADMIN','JEFE_TECNICA_CALIDAD','RECEPCION','ANALISTA','AUDITOR']) THEN
  -- incluir conteos de muestras
ELSE
  samples_received := NULL;
  samples_pending := NULL;
END IF;
```

---

### H-06 🟢 BAJA — `notifications: insert` sin restricción de destinatario (ventana entre migraciones)

**Migración:** `20261017130000_notifications_admin.sql` (original); corregido en `20261019170000_admin_notifications_audit.sql`.

**Descripción:**  
La política original `"notifications: insert"` permitía a cualquier usuario activo insertar una notificación con cualquier `user_id` como destinatario:

```sql
-- versión original (20261017130000):
create policy "notifications: insert" on public.notifications
  for insert to authenticated with check (public.current_user_is_active());
```

La migración `20261019170000` la reemplaza con:

```sql
create policy "notifications: insert own"
  on public.notifications for insert to authenticated
  with check (user_id = auth.uid() and public.current_user_is_active());
```

Un atacante con una sesión válida podría haber spameado la bandeja de entrada de cualquier otro usuario entre la migración 13 y la 17.

**Estado:** Corregido. El mismo riesgo de entornos con migraciones parciales aplica (ver H-04).

---

### H-07 🟢 BAJA — Vistas `v_error_summary` y `v_denied_attempts` sin política propia de acceso

**Migración:** `20261017040000_observability.sql`.

**Descripción:**  
Las vistas se crean con `security_invoker = true` (el usuario que las consulta usa sus propios permisos). La política de lectura sobre `client_error_logs` restringe SELECT a `ADMIN` y `ADMIN_TECNICO`; la política sobre `audit_logs` restringe a `ADMIN`, `JEFE_TECNICA_CALIDAD` y `AUDITOR`. Por tanto, la restricción funciona vía las tablas subyacentes.

Sin embargo, no existe un rol `ADMIN_TECNICO` definido en las migraciones. La política usa un rol inexistente, lo que podría generar una brecha si en algún momento se habilita o si se llama directamente a la vista con un usuario que no tiene política de lectura sobre la tabla base.

**Corrección propuesta:**  
Verificar si `ADMIN_TECNICO` está definido como rol del sistema. Si no, reemplazarlo por el rol equivalente (probablemente `ADMIN`) y agregar el rol a `public.roles` si se requiere como rol diferenciado.

---

### H-08 🟢 BAJA — `document_counters` y `excel_import_batches` sin políticas explícitas

**Migraciones:** `20261017020000_security_shared_data.sql`, `20261019150000_excel_import_batches.sql`.

**Descripción:**  
Ambas tablas tienen `REVOKE ALL FROM anon, authenticated` y RLS activo sin ninguna política definida. Esto es **seguro por defecto** (denegación implícita) y el acceso solo ocurre vía funciones `SECURITY DEFINER`. El hallazgo se registra porque una auditoría futura podría marcarlas como "tabla sin política = error de configuración".

**Corrección propuesta:**  
Agregar políticas explícitas de denegación o de acceso solo vía RPC como documentación de intención:

```sql
-- Documenta que el acceso es intencional solo vía RPC
COMMENT ON TABLE public.document_counters IS 
  'Acceso solo vía next_counter() SECURITY DEFINER. Sin políticas directas por diseño.';
COMMENT ON TABLE public.excel_import_batches IS 
  'Acceso solo vía has_excel_import() y record_excel_import() SECURITY DEFINER.';
```

---

### H-09 ℹ️ INFO — `pending_decisions` legible por todos los roles activos

**Migración:** `20261017130000_notifications_admin.sql`, política `"pending_decisions: read"`.

**Descripción:**  
Cualquier usuario activo puede leer la tabla `pending_decisions` (DP-001 a DP-033), que contiene discusiones de decisiones internas de gobernanza del sistema. No son datos de clientes ni resultados analíticos; son notas de proceso interno. El riesgo es muy bajo, pero expone detalles de la hoja de ruta interna del laboratorio.

**Recomendación:** Si se decide restringir, limitar la lectura a ADMIN y JEFE_TECNICA_CALIDAD. Si es intencional que todos los usuarios vean las decisiones pendientes del sistema (transparencia interna), documentarlo como decisión de diseño en DP-correspondiente.

---

## 3. Funciones SECURITY DEFINER — Inventario

Todas las funciones SECURITY DEFINER que aceptan datos del usuario validan el rol del llamador antes de ejecutar operaciones privilegiadas. No se encontraron funciones que ejecuten lógica privilegiada sin verificar primero `auth.uid()` y el rol correspondiente.

| Función | Validación de rol | Migración |
|---------|-------------------|-----------|
| `create_profile_for_auth_user()` | Trigger de sistema (no aplica) | 20261017020000 |
| `current_user_is_active()` | Función de apoyo (no aplica) | 20261017020000 |
| `has_role(text)` | Función de apoyo (no aplica) | 20261017020000 |
| `has_any_role(text[])` | Función de apoyo (no aplica) | 20261017020000 |
| `next_counter(text, int)` | ✓ `current_user_is_active()` | 20261017020000 |
| `log_audit(...)` | ✓ Revocada de anon/authenticated; solo llamable desde otras SECURITY DEFINER | 20261017020000 |
| `create_test_version(uuid, jsonb)` | ✓ `has_role('ADMIN')` | 20261017030000 |
| `approve_template(uuid)` | ✓ `has_role('JEFE_TECNICA_CALIDAD')` | 20261017050000 |
| `new_template_version(uuid)` | ✓ `has_role('ADMIN')` | 20261017050000 |
| `retire_template(uuid)` | ✓ `has_role('ADMIN')` | 20261017050000 |
| `save_sample_field_data(...)` | ✓ `has_role('MUESTREO')` | 20261017160000 |
| `register_sample_attachment(...)` | ✓ `has_any_role(['RECEPCION','ADMIN'])` | 20261017160000 |
| `retire_sample_attachment(...)` | ✓ `has_any_role(['RECEPCION','ADMIN'])` | 20261017160000 |
| `save_sample(uuid, jsonb, text)` | ✓ `has_any_role(['ADMIN','RECEPCION'])` | 20261017150000 |
| `import_samples_csv(jsonb)` | ✓ `has_any_role(['ADMIN','RECEPCION'])` | 20261017150000 |
| `create_external_shipment(jsonb)` | ✓ `has_any_role(['RECEPCION','ANALISTA','ADMIN'])` | 20261019100000 |
| `receive_external_report(uuid, timestamptz)` | ✓ `has_any_role(['RECEPCION','ANALISTA','ADMIN'])` | 20261019100000 |
| `cancel_external_shipment(uuid, text)` | ✓ `has_any_role(['RECEPCION','ANALISTA','ADMIN'])` | 20261019100000 |
| `save_result_import(jsonb, jsonb)` | ✓ `has_any_role(['ANALISTA','ADMIN'])` | 20261019110000 |
| `set_result_import_status(uuid, text)` | ✓ `has_any_role(['ANALISTA','ADMIN'])` | 20261019110000 |
| `confirm_result_import_row(uuid, uuid, jsonb)` | ✓ `has_any_role(['ANALISTA','ADMIN'])` | 20261019110000 |
| `record_result_correction(uuid, jsonb, text)` | ✓ `has_any_role(['ANALISTA','ADMIN'])` | 20261019110000 |
| `detect_reconciliation_issues(uuid)` | ✓ `has_role('ANALISTA') OR has_role('ADMIN')` | 20261019120000 |
| `resolve_reconciliation_issue(...)` | ✓ Por tipo de decisión (JTC/ANALISTA/ADMIN) | 20261019120000 |
| `import_regulation_csv(...)` | ✓ `has_role('ADMIN')` | 20261019130000 |
| `activate_regulation_version(uuid)` | ✓ `has_role('ADMIN')` | 20261019130000 |
| `confirm_sample_regulations(uuid, jsonb, text)` | ✓ `has_any_role(['ANALISTA','ADMIN'])` | 20261019130000 |
| `run_validations(text, uuid)` | ✓ `has_any_role(['ANALISTA','JTC','ADMIN'])` | 20261019140000 |
| `resolve_validation_warning(uuid, text)` | ✓ `has_any_role(['ANALISTA','JTC','ADMIN'])` | 20261019140000 |
| `has_excel_import(text, text)` | ✓ `current_user_is_active()` + rol por tipo | 20261019150000 |
| `record_excel_import(...)` | ✓ Mismo que `has_excel_import` | 20261019150000 |
| `save_report_draft(...)` | ✓ `has_role('ANALISTA')` + propiedad | 20261019160000 |
| `transition_report(uuid, text, text)` | ✓ Máquina de estados + segregación de roles | 20261019160000 |
| `get_report_history(uuid)` | ✓ Propiedad o ADMIN/JTC/AUDITOR | 20261019160000 |
| `add_report_comment(uuid, text, uuid, text)` | ✓ ANALISTA (propio) o JTC | 20261019160000 |
| `get_dashboard_summary(timestamptz)` | ✓ `current_user_is_active()` (ver H-05) | 20261019170000 |
| `register_issued_report_file(uuid, text, text)` | ✓ `has_role('ADMIN')` | 20261019180000 |
| `issue_report(uuid)` | ✓ `has_role('JEFE_TECNICA_CALIDAD')` + segregación | 20261019190000 |
| `save_quote(uuid, jsonb)` | ✓ `has_any_role(['ADMIN','COMERCIAL'])` | 20261017140000 |
| `set_quote_status(uuid, text)` | ✓ `has_any_role(['ADMIN','COMERCIAL'])` | 20261017140000 |
| `confirm_legacy_mapping(uuid, text, text)` | ✓ `has_any_role(['ADMIN','JTC'])` | 20261017170000 |

---

## 4. Matriz de acceso por rol y tabla sensible

Roles del sistema: **ADMIN**, **JEFE_TECNICA_CALIDAD (JTC)**, **ANALISTA**, **RECEPCION**, **MUESTREO**, **COMERCIAL**, **AUDITOR**. El rol `anon` no tiene acceso a ninguna tabla (revocado explícitamente en todas las migraciones).

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `profiles` | ADMIN (todos); propio (cualquier auth) | — (solo vía trigger `auth.users`) | ADMIN (columna `active`) | — |
| `user_roles` | ADMIN (todos); propio | ADMIN | — | ADMIN |
| `clients` | ⚠️ **Todos los activos** | ADMIN, COMERCIAL | ADMIN, COMERCIAL | — |
| `contacts` | ⚠️ **Todos los activos** | ADMIN, COMERCIAL | ADMIN, COMERCIAL | — |
| `quotes` | ADMIN, COMERCIAL (todos); otros solo status=ACTIVE | Vía `save_quote()` | Vía `save_quote()` / `set_quote_status()` | — |
| `samples` | ADMIN, RECEPCION, ANALISTA, MUESTREO, JTC, AUDITOR | Vía `save_sample()` | Vía `save_sample()` | — |
| `sample_receptions` | Mismo que `samples` | Vía `save_sample()` | Vía `save_sample()` | — |
| `sample_attachments` | ADMIN, RECEPCION, ANALISTA, JTC, AUDITOR | Vía `register_sample_attachment()` | Vía `retire_sample_attachment()` | — |
| `results` | ANALISTA, ADMIN, JTC, AUDITOR | Vía `confirm_result_import_row()` | Vía `record_result_correction()` | — |
| `result_imports` | ANALISTA, ADMIN, JTC, AUDITOR | Vía `save_result_import()` | Vía `set_result_import_status()` | — |
| `reports` | ANALISTA (propios), JTC, ADMIN, AUDITOR | ANALISTA (propio, DRAFT) | ANALISTA (propio, DRAFT/RETURNED); Vía RPC | — |
| `report_snapshots` | ANALISTA (propio reporte), JTC, ADMIN, AUDITOR | Vía `issue_report()` | — | — |
| `report_approvals` | ANALISTA (propio), JTC, ADMIN, AUDITOR | Vía `transition_report()` | — | — |
| `audit_logs` | ADMIN, JTC, AUDITOR | Solo vía `log_audit()` SECURITY DEFINER | — | — |
| `app_settings` | Todos los activos | ADMIN | ADMIN | — |
| `sample_regulations` | ⚠️ **Todos los activos** | ANALISTA, ADMIN | ANALISTA, ADMIN | — |

---

## 5. Políticas de Storage

### Buckets

Todos los buckets son privados (`public = false`):

| Bucket | Definido en |
|--------|-------------|
| `source-files` | `20261017020000_security_shared_data.sql` |
| `report-drafts` | `20261017020000_security_shared_data.sql` |
| `issued-reports` | `20261017020000_security_shared_data.sql` |
| `signatures` | `20261017020000_security_shared_data.sql` |
| `template-assets` | `20261017050000_template_editor.sql` |

### Políticas sobre `storage.objects`

La migración `20261017020000` ejecuta:
```sql
REVOKE SELECT ON storage.objects FROM anon, authenticated;
```

Esto elimina el acceso de lectura directa por API para todos los usuarios. Los archivos solo son accesibles vía la Edge Function `create-storage-signed-url`, que:
1. Valida el JWT del llamador contra Supabase Auth.
2. Verifica que el perfil esté activo y el rol esté en la lista permitida por bucket.
3. Para `source-files`: verifica que el `storage_path` exista en `sample_attachments` o `result_imports` (evita enumeración de archivos).
4. Verifica que el objeto exista en Storage antes de firmar.
5. Genera una URL firmada de **60 segundos**.
6. Registra la descarga en `audit_logs`.

Las políticas de INSERT/UPDATE en `storage.objects` están correctamente restringidas a ADMIN/RECEPCION según el bucket.

**Observación:** No existe política `DELETE` sobre `storage.objects`. Los archivos no pueden eliminarse vía API; solo con la `service_role`. Esto es consistente con el diseño de inmutabilidad, pero debe documentarse explícitamente.

---

## 6. Uso de la clave anónima (`anon key`) en el cliente

**Archivo:** `src/lib/supabase.ts`

```typescript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
```

✅ La `anon key` se inyecta exclusivamente vía variables de entorno `VITE_`. No hay claves hardcodeadas en ningún archivo de código fuente.  
✅ No se encontró ningún uso de `service_role` key en código cliente (`src/`).  
✅ No se encontró ningún uso de `supabase.auth.admin` en código cliente.  
✅ La `service_role` solo aparece en la Edge Function `create-storage-signed-url`, donde se inyecta vía `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` (variable de entorno del servidor, no del frontend).  
✅ Los archivos `.env.example` y `.env.local` están en `.gitignore`.

---

## 7. Verificación de fuga entre usuarios

El sistema **no es multi-tenant por organización**: todas las cuentas pertenecen al mismo laboratorio. No existe aislamiento por `organization_id`. Esto es correcto para el modelo de datos descrito, pero implica que:

- Cualquier usuario con rol RECEPCION ve todas las muestras de todos los clientes.
- Cualquier usuario con rol ANALISTA ve todos los resultados del laboratorio.
- El aislamiento es **por rol**, no por cliente asignado.

Este diseño es intencional y consistente con un laboratorio donde los analistas pueden trabajar con cualquier muestra. Los hallazgos H-02 y H-03 señalan casos donde roles sin relación operativa directa con un dato también tienen acceso.

---

## 8. Resumen de correcciones propuestas por prioridad

| Prioridad | ID | Acción |
|-----------|-----|--------|
| 1 | H-01 | Migración para agregar `FORCE ROW LEVEL SECURITY` a todas las tablas |
| 2 | H-02 | Restringir lectura de `clients`/`contacts` por rol (requiere decisión sobre acceso de ANALISTA) |
| 3 | H-03 | Restringir lectura de `sample_regulations` a roles operativos |
| 4 | H-04 | Verificar que todos los entornos tienen la migración `20261019100000` aplicada |
| 5 | H-07 | Confirmar o crear el rol `ADMIN_TECNICO`; actualizar política de `client_error_logs` |
| 6 | H-05 | Filtrar conteos de muestras en `get_dashboard_summary` por rol |
| 7 | H-06 | Verificar que todos los entornos tienen la migración `20261019170000` aplicada |
| 8 | H-08 | Agregar comentarios de documentación en tablas sin política explícita |
| 9 | H-09 | Decisión de negocio: visibilidad de `pending_decisions` para todos los roles |

---

> **Nota:** Este documento es el resultado de una revisión estática. No reemplaza una prueba de penetración ni una auditoría de Supabase Auth (configuración de JWT, duración de sesiones, MFA). Se recomienda revisar también la configuración del dashboard de Supabase: habilitación de MFA, restricción de proveedores de autenticación, y configuración de SMTP para correos de recuperación.
