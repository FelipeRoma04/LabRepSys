---
description: Cierre tecnico y QA
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Esta es la etapa de CIERRE TÉCNICO: no agregues funcionalidades nuevas.

1. RUTAS: recorre todas las rutas y elimina los placeholders vacíos. Lo que no esté implementado debe mostrar un estado claro ("Pendiente de definición funcional" o "No implementado en MVP") sin simular funcionalidad.

2. PRUEBA DE PUNTA A PUNTA con datos DEMO (claramente identificados y borrables): cliente, contacto y cotización; recibir AG0346; asignar ensayos SA y subcontratados; registrar envíos; cargar resultados incluyendo "< 0,040"; inconsistencias de fecha y matriz; conciliación; confirmar normativa; preparar RSA; verificar el bloqueo por reporte pendiente; registrar recepción externa; enviar a revisión; devolver y corregir; aprobar con un usuario distinto al preparador; emitir; comprobar el snapshot tras cambiar el catálogo; rectificar; revisar auditoría.
Usa varios usuarios de prueba con distintos roles. Si hay Playwright o puedes agregarlo de forma ligera, automatiza este flujo; si no, déjalo como lista manual verificable.

3. TRAZABILIDAD: contrasta con docs/ESPECIFICACION_v0_2.md los criterios CA-001 a CA-016 y los casos CP-001 a CP-015. Para cada uno indica IMPLEMENTADO, PARCIAL, PENDIENTE o BLOQUEADO POR DECISIÓN (con el DP), con evidencia (archivo, migración o prueba).

4. SEGURIDAD: RLS en todas las tablas; ninguna política "allow all"; Storage privado y signed URLs; ausencia de service_role y secretos en el repositorio y en el build; revisión de XSS (sin dangerouslySetInnerHTML sin sanitizar), validación de entradas y archivos; errores sin datos sensibles; vistas con security_invoker; funciones security definer con search_path fijo; npm audit y revisión de dependencias (en particular, que no se use la librería xlsx de npm).

5. CALIDAD: ejecuta npm run build, npm run lint y npm test si existen; corrige errores reales.

6. DOCUMENTOS (raíz y docs/):
- IMPLEMENTATION_STATUS.md (por requisito RF y RNF relevante)
- TEST_REPORT.md
- SECURITY_CHECKLIST.md
- DEPLOYMENT.md: GitHub Pages (workflow de GitHub Actions, VITE_BASE_PATH, HashRouter, variables del repositorio; advertir que el anon key es público por diseño y que la seguridad depende de RLS), pasos manuales de Supabase y notas de respaldo y restauración (RPO/RTO pendientes, DP-016).
- README actualizado con la instalación completa.

Detente y reporta: módulos terminados, tablas, políticas RLS, pruebas, build, pendientes funcionales por DP, riesgos reales y pasos manuales.
