# Plan de Respaldo — LabRepSys

> **Última revisión:** 2026-11-20
> **Estado:** Script de respaldo endurecido. La restauración en un proyecto aislado sigue pendiente. RPO/RTO pendientes de definición (DP-016).

---

> [!IMPORTANT]
> **RPO y RTO pendientes de definición (DP-016).** Este documento establece el procedimiento técnico de respaldo. Los objetivos de punto de recuperación (RPO) y tiempo de recuperación (RTO) deben ser aprobados por el responsable del sistema junto con el área de Calidad. Hasta que se definan, se recomienda un respaldo **semanal mínimo** con prueba de restauración **mensual**.

---

## Alcance del respaldo

| Componente | Método | Responsable |
|------------|--------|-------------|
| Esquema SQL (DDL) | `supabase db dump --schema public` | Administrador del sistema |
| Datos de tablas `public` | `supabase db dump --data-only` | Administrador del sistema |
| Storage: `source-files` | Manual / CLI con service_role (entorno seguro) | Administrador del sistema |
| Storage: `report-drafts` | Manual / CLI con service_role (entorno seguro) | Administrador del sistema |
| Storage: `issued-reports` | Manual / CLI con service_role (entorno seguro) | Administrador del sistema |
| Storage: `signatures` | Manual / CLI con service_role (entorno seguro) | Administrador del sistema |
| Código fuente | Git + GitHub (remoto) | Automático con cada push |

---

## Procedimiento de respaldo de base de datos

### Prerrequisitos

- Supabase CLI instalado (`npx supabase` o binario global)
- `SUPABASE_PROJECT_REF` y `SUPABASE_ACCESS_TOKEN` disponibles como variables de entorno **locales** (nunca en CI público ni en el repo)
- Directorio de destino con permisos de escritura fuera del repositorio

### Ejecución

```bash
# Configurar variables (ejemplo — usar un gestor de secretos en producción)
export SUPABASE_PROJECT_REF="<project-ref>"
export SUPABASE_ACCESS_TOKEN="<tu-token-personal>"
export BACKUP_DIR="/ruta/segura/fuera/del/repo/backups"

# Ejecutar script de respaldo
bash scripts/ops/backup.sh
```

El script genera en `$BACKUP_DIR/<timestamp>/`:
- `schema.sql` — DDL completo del esquema `public`
- `data.sql` — Datos de todas las tablas `public`
- `checksums.sha256` — Hashes SHA-256 de ambos archivos
- `metadata.json` — Metadatos del respaldo

### Verificar integridad del respaldo

```bash
cd /ruta/segura/fuera/del/repo/backups/<timestamp>/
sha256sum -c checksums.sha256
```

Resultado esperado: todos los archivos deben reportar `OK`.

---

## Respaldo de Storage

> [!CAUTION]
> El respaldo de Storage requiere la `service_role`, que **nunca debe estar en el repositorio ni en el frontend**. Ejecutar solo desde un entorno local controlado y auditado.

### Opción A — Dashboard de Supabase (buckets pequeños)

1. Ir a **Storage → [nombre del bucket]** en el dashboard.
2. Seleccionar todos los objetos y descargar.
3. Documentar fecha y cantidad de archivos descargados.

### Opción B — CLI de Supabase (recomendado para producción)

```bash
# Requiere SUPABASE_ACCESS_TOKEN con permisos de Storage
export SUPABASE_PROJECT_REF="<project-ref>"
export SUPABASE_ACCESS_TOKEN="<token>"

npx supabase login --token "${SUPABASE_ACCESS_TOKEN}"
npx supabase link --project-ref "${SUPABASE_PROJECT_REF}"

# Copiar bucket completo
npx supabase storage cp ss://source-files ./backup-storage/source-files --recursive
npx supabase storage cp ss://report-drafts ./backup-storage/report-drafts --recursive
npx supabase storage cp ss://issued-reports ./backup-storage/issued-reports --recursive
npx supabase storage cp ss://signatures ./backup-storage/signatures --recursive
```

> [!WARNING]
> Los archivos copiados contendrán datos confidenciales de clientes y resultados de laboratorio. Guarda el respaldo en un sistema con acceso restringido, cifrado en reposo, y con control de acceso auditado.

### Opción C — Metadatos vía pg_dump (sin contenido binario)

```bash
# Solo exporta los metadatos de storage.objects, no el contenido de los archivos
npx supabase db dump --schema storage --data-only --file storage-objects-meta.sql
```

Útil para auditoría de qué archivos existían, pero no sirve para restaurar el contenido.

---

## Procedimiento de restauración

> [!CAUTION]
> **Probar la restauración en un proyecto vacío y separado** antes de necesitarla en producción. Nunca restaures directamente sobre el proyecto de producción sin verificar los datos.

### Restauración de base de datos

```bash
# 1. Crear un proyecto de prueba en Supabase Dashboard
# 2. Vincular y aplicar migraciones base
npx supabase link --project-ref <proyecto-de-prueba>
npx supabase db push

# 3. Restaurar los datos
psql "<connection-string-del-proyecto-prueba>" -f /ruta/backup/<timestamp>/data.sql

# 4. Verificar integridad
# - Contar registros en tablas principales
# - Verificar que los roles están presentes en public.roles
# - Verificar que los perfiles tienen sus roles asignados
```

### Restauración de Storage

```bash
# Subir archivos al proyecto de restauración
npx supabase storage cp ./backup-storage/source-files ss://source-files --recursive
npx supabase storage cp ./backup-storage/issued-reports ss://issued-reports --recursive
# ...etc para cada bucket
```

### Lista de verificación post-restauración

- [ ] Login funciona con al menos un usuario ADMIN
- [ ] Tablas principales tienen el número esperado de registros
- [ ] Los archivos en `issued-reports` son accesibles vía URL firmada
- [ ] Los roles y perfiles están correctamente asignados
- [ ] Las RLS policies están activas (`SELECT relrowsecurity FROM pg_class WHERE relname = 'profiles'`)
- [ ] Edge Functions responden correctamente

---

## Frecuencia recomendada (provisional hasta DP-016)

| Tipo | Frecuencia mínima provisional | Retención sugerida |
|------|------------------------------|-------------------|
| Base de datos (esquema + datos) | Semanal | 4 semanas |
| Storage (archivos) | Mensual | 3 meses |
| Prueba de restauración | Mensual | — |

> [!NOTE]
> Supabase ofrece **respaldos automáticos diarios** en planes pagos (Pro y superiores). En el **plan Free**, los respaldos automáticos son limitados y pueden no estar disponibles. Revisa el panel de tu proyecto en **Settings → Database → Backups** para confirmar qué ofrece tu plan.

---

## Opciones de RPO/RTO (pendiente DP-016)

Se presentan opciones para que el responsable del sistema decida:

| Opción | RPO | RTO | Costo adicional | Notas |
|--------|-----|-----|-----------------|-------|
| A — Plan Free Supabase + backup manual semanal | ~7 días | ~4 horas | Sin costo | Riesgo alto de pérdida |
| B — Plan Pro Supabase + backup automático diario | ~24 horas | ~2 horas | ~$25 USD/mes | Recomendado para producción |
| C — Point-in-Time Recovery (PITR) Supabase | Minutos | <1 hora | Plan adicional | Para datos críticos de alta frecuencia |

**Decisión pendiente de DP-016.** Documentar aquí una vez aprobada.

---

## Historial de respaldos realizados

| Fecha | Tipo | Realizado por | Hash de verificación | Notas |
|-------|------|--------------|---------------------|-------|
| — | — | — | — | Aún no se han realizado respaldos de producción |

---

## Prueba de restauración — Validación pendiente

> **Revisión:** 2026-11-20
> **Estado:** Procedimiento documentado y script revisado estáticamente. No se ha ejecutado una restauración en Supabase.
> **Entorno requerido:** Proyecto Supabase de prueba vacío. No usar producción.

### Resultado de la validación del script `backup.sh`

El script fue revisado en detalle. Se verificaron los siguientes puntos:

| Verificación | Resultado |
|---|---|
| Usa variables de entorno (`SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`) en lugar de credenciales hardcodeadas | ✅ Correcto |
| Genera `schema.sql`, `data.sql`, `checksums.sha256` y `metadata.json` bajo `$BACKUP_DIR/<timestamp>/` | ✅ Correcto |
| Calcula hashes SHA-256 de ambos archivos SQL | ✅ Correcto |
| No incluye datos del esquema `auth` (evita exportar hashes de contraseñas) | ✅ Correcto (`--schema public` solamente) |
| Muestra orientación para Storage pero no intenta acceder con `service_role` automáticamente | ✅ Correcto |
| `set -euo pipefail` — aborta ante cualquier error inesperado | ✅ Correcto |

### Paso a paso del procedimiento de restauración

A continuación se documenta el procedimiento completo que debe seguir el administrador del sistema cuando necesite restaurar desde un respaldo. Estos pasos están diseñados para ejecutarse **siempre en un proyecto de prueba primero**.

---

#### Fase 0 — Preparación del entorno

**Prerrequisitos:**
- Supabase CLI instalado (`npx supabase --version` debe devolver una versión ≥ 1.x)
- Node.js ≥ 18 disponible en el sistema
- Acceso a un proyecto Supabase de prueba (vacío o de restauración, **nunca el de producción**)
- Los archivos de respaldo accesibles localmente (verificar integridad antes de restaurar)
- El directorio del repositorio clonado (`git clone https://github.com/feliperoma04/LabRepSys`)

**Verificar integridad del respaldo antes de restaurar:**

```bash
cd /ruta/al/backup/<timestamp>/
sha256sum -c checksums.sha256
# Resultado esperado: todos los archivos reportan OK
# schema.sql: OK
# data.sql: OK
```

Si algún archivo reporta `FAILED`, el respaldo está corrupto. No continuar.

---

#### Fase 1 — Aplicar el esquema base (migraciones)

El respaldo de `schema.sql` exporta el DDL del esquema `public`, pero la forma recomendada de recrear el esquema en un proyecto nuevo es **ejecutar las migraciones en orden**, lo que garantiza que RLS, funciones y triggers quedan igual que en producción.

```bash
# 1. Ir al directorio del repositorio
cd /ruta/al/repositorio/LabRepSys

# 2. Configurar variables del proyecto de prueba
export SUPABASE_PROJECT_REF="<ref-del-proyecto-de-prueba>"
export SUPABASE_ACCESS_TOKEN="<tu-token-de-acceso>"

# 3. Vincular al proyecto de prueba
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"

# 4. Aplicar todas las migraciones en orden
npx supabase db push
# Esto ejecuta las 26 migraciones de supabase/migrations/ en orden cronológico
# Debe terminar sin errores.
```

**Resultado esperado:** El proyecto de prueba tendrá todas las tablas, funciones, triggers, políticas RLS y buckets de Storage configurados.

---

#### Fase 2 — Restaurar los datos

Una vez que el esquema está en pie, se restauran los datos del respaldo.

```bash
# Obtener la cadena de conexión directa del proyecto de prueba
# (Supabase Dashboard → Project Settings → Database → Connection string → URI)
# Formato: postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

export DB_URI="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"

# Restaurar datos
psql "$DB_URI" -f /ruta/al/backup/<timestamp>/data.sql
```

> [!WARNING]
> `data.sql` puede contener datos de clientes y resultados confidenciales. Asegúrese de que el proyecto de prueba tiene acceso restringido y de que los datos se eliminarán al finalizar la prueba.

**Si hay errores de dependencias de clave foránea** (FK) al importar:
1. Verificar que las migraciones se aplicaron completamente (Fase 1).
2. Si el respaldo proviene de producción con datos de `auth.users`, primero crear los usuarios en el proyecto de prueba vía Supabase Dashboard o mediante seed manual de perfiles.
3. Ajustar el orden de inserción en `data.sql` si es necesario (tablas padre antes que tablas hijo).

---

#### Fase 3 — Verificación post-restauración

Ejecutar la siguiente lista de verificación. Marcar cada ítem con evidencia:

```bash
# Conectar con psql al proyecto de prueba
psql "$DB_URI"
```

```sql
-- 1. Verificar que RLS está activo en tablas principales
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
  AND relname IN ('profiles', 'samples', 'results', 'reports', 'clients')
ORDER BY relname;
-- Esperado: relrowsecurity = true para todas

-- 2. Contar registros en tablas principales (comparar con producción)
SELECT
  (SELECT count(*) FROM public.profiles)      AS perfiles,
  (SELECT count(*) FROM public.samples)       AS muestras,
  (SELECT count(*) FROM public.results)       AS resultados,
  (SELECT count(*) FROM public.reports)       AS reportes,
  (SELECT count(*) FROM public.clients)       AS clientes,
  (SELECT count(*) FROM public.roles)         AS roles;

-- 3. Verificar que los roles del sistema están presentes
SELECT code FROM public.roles ORDER BY code;
-- Esperado: ADMIN, ANALISTA, AUDITOR, COMERCIAL, JEFE_TECNICA_CALIDAD, MUESTREO, RECEPCION

-- 4. Verificar que hay al menos un usuario ADMIN
SELECT p.email, p.active, ur.role_code
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id
WHERE ur.role_code = 'ADMIN'
  AND p.active = true;
-- Esperado: al menos una fila
```

**Verificación funcional en la aplicación:**

```
□ Login funciona con al menos un usuario ADMIN
□ Dashboard carga sin errores
□ Lista de muestras muestra registros
□ Lista de clientes muestra registros
□ Al menos un reporte emitido aparece en la lista de reportes emitidos
□ Los archivos en issued-reports son accesibles vía URL firmada (probar descarga)
□ Las políticas RLS están activas (resultado del query anterior = true)
```

---

#### Fase 4 — Restauración de Storage (si aplica)

El respaldo de Storage es independiente y manual. Para restaurarlo en el proyecto de prueba:

```bash
# Requiere Supabase CLI con permisos de Storage
npx supabase login --token "$SUPABASE_ACCESS_TOKEN"
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"

# Subir archivos desde el respaldo local
npx supabase storage cp ./backup-storage/source-files   ss://source-files   --recursive
npx supabase storage cp ./backup-storage/report-drafts  ss://report-drafts  --recursive
npx supabase storage cp ./backup-storage/issued-reports ss://issued-reports --recursive
npx supabase storage cp ./backup-storage/signatures     ss://signatures     --recursive
```

**Verificar que los buckets no son públicos:**
- En Supabase Dashboard → Storage, confirmar que ningún bucket tiene el ícono de "Public".
- Si algún bucket aparece como público, ejecutar:
  ```sql
  UPDATE storage.buckets SET public = false
  WHERE id IN ('source-files','report-drafts','issued-reports','signatures','template-assets');
  ```

---

### Hallazgos y observaciones del procedimiento

| Observación | Impacto | Recomendación |
|---|---|---|
| `backup.sh` no incluye el esquema `auth` ni hashes de contraseñas | Positivo — no exporta datos sensibles de autenticación | Mantener así |
| La restauración de datos requiere que los usuarios existan en `auth.users` antes de importar `public.profiles` | Medio — necesita pasos manuales | Documentar lista de usuarios de prueba para restauración |
| `sha256sum` no está disponible en macOS por defecto (usar `shasum -a 256`) | Bajo | Agregar compatibilidad en el script: `command -v sha256sum >/dev/null 2>&1 || alias sha256sum='shasum -a 256'` |
| No existe script de restauración automatizado; el proceso es enteramente manual | Medio | Crear `scripts/ops/restore.sh` con los pasos de las Fases 1–3 (pendiente) |
| RPO/RTO siguen sin definición formal (DP-016) | Alto para producción | Resolver DP-016 antes de poner el sistema en producción |

---

### Validación del procedimiento

| Elemento | Estado |
|---|---|
| Script `backup.sh` revisado y sin errores lógicos | ✅ Validado (revisión estática) |
| Procedimiento de restauración documentado paso a paso | ✅ Completo |
| Lista de verificación post-restauración creada | ✅ Completa |
| Ejecución contra proyecto de prueba real | ⏳ Pendiente — requiere un proyecto Supabase de prueba vacío y sus credenciales |
| Restauración de Storage documentada | ✅ Completa (procedimiento) |

> [!NOTE]
> La restauración aún no está validada. Primero debe ejecutarse contra un proyecto Supabase de prueba vacío; registrar allí los resultados antes de considerar el proceso probado.
