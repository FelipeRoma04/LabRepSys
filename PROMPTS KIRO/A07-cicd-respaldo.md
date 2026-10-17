# A07 - CI/CD, seguridad del repositorio y respaldo

Prerrequisito: ninguno; ejecutar cuando quieras desplegar.
Rama: feature/a07-cicd
Puede tocar: .github/workflows/**, scripts/ops/**, docs/DEPLOYMENT.md, docs/RESPALDO.md, dependabot.yml.
No tocar: codigo de la aplicacion y migraciones.

OBJETIVO
Integracion continua, despliegue a GitHub Pages y procedimiento de respaldo.

REQUISITOS
- Workflow ci.yml en cada PR: npm ci, lint, typecheck, test, build, npm audit (falla en alta o critica).
- Workflow de despliegue a GitHub Pages con actions/upload-pages-artifact y actions/deploy-pages; VITE_BASE_PATH desde el nombre del repo; VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY desde variables del repositorio. Fijar versiones de las actions.
- Deteccion de secretos con gitleaks (MIT) en PR; bloquear si aparece service_role o claves.
- Verificacion automatica: el build NO debe contener la cadena service_role.
- Dependabot semanal para npm y actions.
- Validar migraciones: supabase db lint y comprobar que todas las tablas public tienen RLS activo (consulta a pg_tables/pg_class en CI contra un Postgres temporal).
- Respaldo: script scripts/ops/backup.sh con supabase db dump (esquema y datos) y documentacion de copia de Storage; procedimiento de restauracion probado en un proyecto vacio. RPO/RTO siguen pendientes (DP-016): documentar opciones, no decidirlas.
- Advertir en docs/DEPLOYMENT.md: el anon key es publico por diseno; GitHub Pages gratuito exige repo publico; revisar region y plan de Supabase (los planes gratuitos pueden pausarse y tienen respaldos limitados).

ACEPTACION
- CI verde en un PR de prueba y rojo al introducir una clave falsa o una tabla sin RLS.
- docs/DEPLOYMENT.md y docs/RESPALDO.md con pasos verificables.
