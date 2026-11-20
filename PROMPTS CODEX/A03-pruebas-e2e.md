# A03 - Pruebas end-to-end con Playwright

Prerrequisito: minimo p04. Crece conforme Copilot termina cada modulo; el flujo completo requiere p14.
Rama: feature/a03-e2e
Puede tocar: e2e/**, playwright.config.ts, scripts/e2e/**, package.json (solo devDependencies y scripts de e2e).
No tocar: codigo de la aplicacion. Si hace falta un atributo data-testid, agregalo de forma minima y avisalo en el PR.

OBJETIVO
Automatizar el flujo real de la especificacion con varios usuarios y roles.

REQUISITOS
- Playwright (Apache-2.0). Usar un proyecto Supabase de PRUEBAS separado del de desarrollo; nunca contra datos reales.
- Script scripts/e2e/seed-users.mjs que cree usuarios de prueba por rol (ADMIN, COMERCIAL, RECEPCION, MUESTREO, ANALISTA, JEFE_TECNICA_CALIDAD, AUDITOR) con la service_role leida de variable de entorno LOCAL. La service_role nunca entra al frontend ni al repo; documentarlo.
- Estado de sesion por rol (storageState) para no iniciar sesion en cada prueba.
- Flujo principal, por etapas segun lo disponible: login y permisos por rol; cliente y cotizacion; recepcion de AG0346 (AG00106 rechazado); datos de campo con valor 0 vs no reporta; envio externo y bloqueo por pendiente; resultado "< 0,040"; conciliacion con motivo; normativa sin confirmar bloquea; RSA y segregacion (analista no aprueba); emision, snapshot y rectificacion.
- Pruebas de seguridad de caja negra: acceder a rutas sin rol, intentar escribir a tablas ajenas via el cliente, URL de Storage sin firmar.
- Datos demo identificados y limpiables.

ACEPTACION
- npx playwright test pasa localmente; reporte HTML generado.
- Cada prueba mapea a un CP o CA de la especificacion (comentario con el ID).
- docs/E2E.md explica como correr, variables y como agregar casos.
