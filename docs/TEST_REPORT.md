# Informe de pruebas

Fecha: 2026-10-19. Checkout local; ejecución contra entorno de desarrollo disponible.

## Verificaciones ejecutadas

| Verificación | Resultado | Detalle |
|---|---|---|
| `npm test` | Correcto | 28 archivos, 163 pruebas pasaron. Vitest mostró una advertencia de `HTMLCanvasElement.getContext` sin canvas; no falló ninguna prueba. |
| `npm run build` | Correcto con advertencia | TypeScript y Vite completaron. Chunks minificados de aplicación (694 kB) y ExcelJS (929 kB) superan 500 kB. |
| `npm run lint` | Correcto | ESLint terminó con código 0. |
| `npm audit --audit-level=high` | Correcto con riesgo moderado | No hay vulnerabilidades high/critical reportadas. Hay 2 advisories moderados para `uuid` transitivo de ExcelJS; `npm audit fix --force` propone downgrade mayor de ExcelJS y no se aplicó. |
| `npx supabase test db` | No ejecutable aquí | Requiere Docker local; el daemon Docker no estaba iniciado/disponible. Las pruebas pgTAP no se declaran aprobadas. |
| Migraciones remotas | Aplicadas | `20261019170000_admin_notifications_audit.sql`, `20261019180000_issued_pdf_registration.sql`, `20261019190000_rsa_issuance_snapshot.sql` se aplicaron con `supabase db push`; el historial remoto se comprobó. |
| Revisión estática de secretos/XSS/dependencias | Sin hallazgos indicados abajo | Revisiones con `rg` descritas en `SECURITY_CHECKLIST.md`; no sustituyen auditoría especializada. |

## Prueba manual de punta a punta requerida

No se ejecutó una E2E con navegadores/usuarios reales: el repositorio no tiene Playwright ni datos demo identificados, y no se deben crear datos de negocio en el proyecto compartido. Ejecutar en un proyecto Supabase de pruebas, con usuarios diferenciados (ADMIN, COMERCIAL, RECEPCION, MUESTREO, ANALISTA, JTC y AUDITOR), datos identificados como DEMO y plan de limpieza:

- [ ] Crear cliente DEMO, contacto y cotización; verificar permisos y auditoría.
- [ ] Recibir muestra `AG0346`; asignar ensayos SA y subcontratados.
- [ ] Registrar envíos externos y cargar resultados incluyendo `< 0,040`.
- [ ] Verificar inconsistencia de fechas y matriz; conciliar y confirmar normativa.
- [ ] Preparar RSA; comprobar bloqueo por reporte externo pendiente.
- [ ] Registrar recepción externa; enviar a revisión, devolver y corregir.
- [ ] Aprobar con usuario JTC distinto del preparador; emitir PDF.
- [ ] Cambiar catálogo y comprobar que el snapshot emitido no cambia.
- [ ] Rectificar y revisar bitácora/auditoría; validar descargas privadas.
- [ ] Limpiar registros y objetos DEMO y conservar evidencia sin datos personales.

## Incidencias/limitaciones

- pgTAP no ejecutado por Docker inactivo; no afirmar cobertura de RLS en runtime con este reporte.
- E2E pendiente; no certificar flujos integrados, segregación real entre cuentas ni restauración.
- Advertencia de tamaño de bundle registrada; no afecta el build correcto, pero conviene dividir cargas pesadas.
- `docs/ESPECIFICACION_v0_2.md` ausente bloquea trazabilidad contractual completa; ver `IMPLEMENTATION_STATUS.md`.
