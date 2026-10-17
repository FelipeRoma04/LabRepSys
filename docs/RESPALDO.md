# Plan de Respaldo — LabRepSys

> **Última revisión:** 2026-10-17  
> **Estado:** Procedimiento base establecido. RPO/RTO pendientes de definición (DP-016).

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
