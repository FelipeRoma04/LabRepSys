#!/usr/bin/env bash
# =============================================================================
# backup.sh — Respaldo de base de datos y orientación para Storage
# Proyecto: LabRepSys / ReportSysDev
# =============================================================================
#
# REQUISITOS
#   - supabase CLI instalado (npx supabase o binario en PATH)
#   - Variables de entorno configuradas (ver sección CONFIGURACIÓN más abajo)
#   - jq instalado para parsear JSON (apt install jq / brew install jq)
#
# USO
#   chmod +x scripts/ops/backup.sh
#   SUPABASE_PROJECT_REF=<ref> \
#   SUPABASE_ACCESS_TOKEN=<token> \
#   BACKUP_DIR=./backups \
#   bash scripts/ops/backup.sh
#
# SEGURIDAD
#   - Nunca pases credenciales como argumentos; usa variables de entorno o un
#     archivo .env LOCAL que nunca se sube al repositorio.
#   - El backup contiene datos de clientes confidenciales. Guárdalo cifrado y
#     en una ubicación protegida fuera del repositorio.
#   - service_role, contraseñas y tokens NUNCA deben aparecer en este script
#     como valores literales.
# =============================================================================

set -euo pipefail

# ── Configuración ─────────────────────────────────────────────────────────────
: "${SUPABASE_PROJECT_REF:?Variable SUPABASE_PROJECT_REF no configurada}"
: "${SUPABASE_ACCESS_TOKEN:?Variable SUPABASE_ACCESS_TOKEN no configurada}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

echo "════════════════════════════════════════════════════════"
echo "  Respaldo LabRepSys — $(date -u)"
echo "  Proyecto : ${SUPABASE_PROJECT_REF}"
echo "  Destino  : ${BACKUP_PATH}"
echo "════════════════════════════════════════════════════════"

mkdir -p "${BACKUP_PATH}"

# ── 1. Autenticar CLI y vincular proyecto ─────────────────────────────────────
echo ""
echo "▸ Autenticando CLI de Supabase..."
npx supabase login --token "${SUPABASE_ACCESS_TOKEN}"

echo "▸ Vinculando proyecto ${SUPABASE_PROJECT_REF}..."
npx supabase link --project-ref "${SUPABASE_PROJECT_REF}"

# ── 2. Dump del esquema (DDL) ─────────────────────────────────────────────────
echo ""
echo "▸ Exportando esquema (DDL)..."
npx supabase db dump \
  --schema public \
  --file "${BACKUP_PATH}/schema.sql"
echo "  → ${BACKUP_PATH}/schema.sql"

# ── 3. Dump de datos (sin datos de auth por seguridad) ────────────────────────
echo ""
echo "▸ Exportando datos del esquema public..."
npx supabase db dump \
  --schema public \
  --data-only \
  --file "${BACKUP_PATH}/data.sql"
echo "  → ${BACKUP_PATH}/data.sql"

# ── 4. Hash de verificación ───────────────────────────────────────────────────
echo ""
echo "▸ Calculando hashes SHA-256..."
sha256sum "${BACKUP_PATH}/schema.sql" "${BACKUP_PATH}/data.sql" \
  > "${BACKUP_PATH}/checksums.sha256"
echo "  → ${BACKUP_PATH}/checksums.sha256"

# ── 5. Metadata del respaldo ──────────────────────────────────────────────────
cat > "${BACKUP_PATH}/metadata.json" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "project_ref": "${SUPABASE_PROJECT_REF}",
  "files": ["schema.sql", "data.sql", "checksums.sha256"],
  "notes": "Respaldo automático. Verificar con: sha256sum -c checksums.sha256"
}
EOF
echo "  → ${BACKUP_PATH}/metadata.json"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✔ Respaldo de base de datos completado."
echo "════════════════════════════════════════════════════════"

# ── 6. Orientación para Storage (no automático) ───────────────────────────────
cat <<'INFO'

════════════════════════════════════════════════════════
  RESPALDO DE STORAGE (manual / semianual)
════════════════════════════════════════════════════════

Los buckets privados (source-files, report-drafts,
issued-reports, signatures) NO se respaldan con este
script porque requieren una service_role que no debe
estar en el entorno de automatización estándar.

Opciones para respaldar Storage:
  a) Supabase Dashboard → Storage → Download (bucket pequeño)
  b) CLI con service_role en entorno AISLADO y controlado:
       npx supabase storage cp \
         ss://source-files . \
         --recursive \
         --project-ref <REF>
     (Requiere acceso con service_role; ejecutar solo desde
      entorno seguro, NUNCA desde el frontend ni CI público)
  c) pg_dump de la tabla storage.objects (solo metadatos,
     sin el contenido binario de los archivos)

Documentar frecuencia y responsable en docs/RESPALDO.md.
RPO/RTO pendientes de definición (DP-016).
INFO

echo ""
echo "▸ Listo. Revisa ${BACKUP_PATH}/"
