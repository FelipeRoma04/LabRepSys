# Lista de revisión de seguridad

Fecha: 2026-10-19. Alcance: inspección del código/migraciones y resultados locales; no es una auditoría de penetración.

| Control | Estado | Evidencia / límite |
|---|---|---|
| RLS | Presente en tablas de aplicación según migraciones | 62 declaraciones de tabla y 205 referencias a activación de RLS/policies en migraciones. Falta ejecutar pgTAP/runtime porque Docker no estaba disponible; conteos no prueban por sí solos cobertura correcta. |
| Políticas permisivas globales | Revisión estática sin `using (true)` de acceso general reportado | Revisar nuevamente en CI y validar con `supabase/tests/database/00_global_security.sql` en proyecto dedicado. |
| Storage | Buckets privados y descargas firmadas según migraciones/función | `supabase/functions/create-storage-signed-url`; confirmar permisos y expiración en prueba E2E. |
| Secretos frontend | Sin `service_role` ni claves privadas encontradas en código/bundle en la revisión `rg` | `VITE_SUPABASE_ANON_KEY` es pública por diseño; RLS es la barrera de acceso. `.env.local` no debe versionarse. |
| XSS | No se encontró `dangerouslySetInnerHTML` en `src` | React escapa texto por defecto; revisar cualquier futuro HTML enriquecido con sanitización explícita. |
| Carga de archivos | Validaciones de tipo/extensión/tamaño y buckets privados en flujos inspeccionados | Prueba negativa (tipo falso, tamaño excesivo, ruta ajena) pendiente E2E. |
| Errores | UI muestra mensajes operativos en lugar de volcar credenciales | No se realizó revisión completa de logs remotos ni de datos sensibles en mensajes. |
| Vistas/funciones SQL | Las migraciones usan vistas con `security_invoker` y funciones con `search_path` fijado en los módulos inspeccionados | pgTAP no ejecutado; requiere inspección/runtime por entorno. |
| Dependencias | `npm audit --audit-level=high`: sin hallazgos high/critical | 2 advisories moderados transitivos de `uuid` por ExcelJS. No forzar downgrade breaking; reevaluar al actualizar ExcelJS. |
| Paquete `xlsx` | No instalado | Se usa `exceljs` (ver `package.json`); la revisión `rg` no encontró importación de `xlsx` npm. |

## Riesgos y acciones

1. Correr pgTAP en un proyecto aislado y corregir cualquier fallo antes de promover cambios.
2. Verificar configuración real de Auth (registro público desactivado), Edge Functions y Storage del proyecto Supabase.
3. Resolver el advisory moderado de ExcelJS/`uuid` en una actualización compatible y repetir build, tests y audit.
4. Ejecutar E2E con cuentas de roles distintos y revisar acceso denegado, URLs firmadas expiradas y carga maliciosa.
