# Estado de implementación

Revision: 2026-10-20. Se retiraron p01-p12 completos; p13-p14 y A01-A07 quedan por trabajo pendiente, p99 por contexto. Las specs K01-K06, el codigo y las migraciones siguen como evidencia.

## Límite de trazabilidad

`docs/ESPECIFICACION_v0_2.md`, citado por las instrucciones, no existe en este checkout. Tampoco están `.github/copilot-instructions.md` ni `docs/ESTADO_ACTUAL.md`. Por ello no es posible certificar cobertura completa de RF/RNF ni conocer las definiciones normativas exactas del glosario. Las funciones se contrastaron contra los prompts disponibles; no se inventan definiciones. Los requisitos citados abajo son los que aparecen expresamente en esos prompts.

## Módulos

| Módulo | Estado | Evidencia / pendiente |
|---|---|---|
| Fundación, autenticación y seguridad base | Implementado en el código | `src/`, migraciones `supabase/migrations/`; no se ejecutó pgTAP por falta de Docker. |
| Catálogos y localización | Implementado según prompts | Servicios y pantallas de catálogos; no se certifica contra la especificación ausente. |
| Clientes y cotizaciones | Implementado según prompts | `src/pages/ClientsPage.tsx`, `QuotesPage.tsx` y migraciones comerciales. |
| Muestras y recepción | Implementado según prompts | `ReceptionPage.tsx`, `SampleDetailPage.tsx` y migraciones de recepción. |
| Campo y adjuntos | Implementado según prompts | `FieldDataPage.tsx`, `supabase/tests/database/55_field_data_attachments.sql`. |
| Laboratorios externos | Implementado según p06 | Registro, asignaciones, vista de pendientes, recepción y pruebas unitarias en `src/pages/ExternalShipmentsPage.test.tsx` y `PendingExternalReportsPage.test.tsx`. La prueba SQL/runtime pgTAP sigue sin ejecutarse por falta de Docker. |
| Resultados e importación | Implementado según p07 | Captura/importación, parseo e idempotencia; los adaptadores PDF de AGQ, Chemilab e IHA precargan filas candidatas (A01, ver `docs/ADAPTADORES_PDF.md`) y OCR sigue fuera del MVP (DP-023). Evidencia en `src/pages/ResultsLoadPage.tsx` y `src/features/import/`. |
| Conciliación | Implementado según prompts | `ReconciliationPage.tsx`, migración `20261019120000_reconciliation_workflow.sql`; ejecutar pgTAP en proyecto de pruebas. |
| Normativa | Implementado según p09, con funciones limitadas por decisiones | Muestra límites y confirma normativa. No determina conformidad ni aplica regla de decisión mientras DP-007..010 sigan pendientes. Evidencia: `src/pages/RegulationsPage.tsx`. |
| Validaciones | Implementado según prompts | Servicios y pruebas unitarias; flujo completo requiere prueba manual integrada. |
| Flujo RSA, revisión y aprobación | Implementado según prompts | `ReportBuilderPage.tsx`, transiciones/RLS en migraciones; aprobación segregada. |
| Emisión PDF y snapshot | Implementado según p12 | Emisión, registro privado y snapshot inmutable implementados. El mecanismo/diseño oficial de firma mantiene las decisiones DP-012 y DP-022. Evidencia: `src/services/reports.ts` y migraciones `20261019180000`, `20261019190000`. |
| Dashboard, administración, auditoría | Implementado según prompts | `DashboardPage.tsx`, `AdministrationPage.tsx`, `AuditPage.tsx`; agrega notificaciones internas, no email/Teams (DP-027). |
| Ayuda contextual K06 | Parcial | Botón, diálogo accesible, búsqueda, contexto y pruebas están implementados. Glosario/roles no pueden certificarse contra sección 19/4 sin `ESPECIFICACION_v0_2.md`; el panel informa esta limitación. |
| Cierre QA p14 | Parcial | Rutas inspeccionadas y checks ejecutados; falta E2E con usuarios/datos demo y pgTAP local. Lista manual en `TEST_REPORT.md`. |

## Tareas adicionales A01-A07

| Tarea | Estado | Pendiente / evidencia |
|---|---|---|
| A01 Adaptadores PDF | Implementada (rama `feature/a01-adaptadores-pdf`, pendiente de PR) | Adaptadores AGQ, Chemilab e IHA con pdfjs-dist, probados contra fixtures anonimizados de los 3 informes de referencia (40, 9 y 1 filas). Conectados a la carga de resultados: página de origen, marcas y observaciones por fila; nada se confirma solo. Ver `docs/ADAPTADORES_PDF.md`. |
| A02 PDF servidor | Bloqueada por especificacion/decision | Falta la seccion 9 de `ESPECIFICACION_v0_2.md` y sigue DP-022 sobre libreria/licencia. La impresion del navegador permanece disponible. |
| A03 E2E Playwright | Pendiente de entorno aislado | No hay Playwright ni proyecto Supabase dedicado con usuarios demo. La lista manual esta en `TEST_REPORT.md`; no usar datos reales. |
| A04 Busqueda global | No implementada | Requiere rama propia segun `PROMPTS CODEX/AGENTS.md`; la rama activa es `feature/a05-importacion-excel`. |
| A05 Importacion Excel | Parcial, pruebas verdes | Importa ensayos/muestras, valida filas, calcula hash, audita y marca observaciones de laboratorio externo para estructuracion manual. Falta el mapeo aprobado de las hojas `LABORATORIO` y `REPORTES`; no se interpreta ni se importa a entidades por suposicion. |
| A06 Accesibilidad | Parcial | `docs/ACCESIBILIDAD.md` registra correcciones y las rutas pendientes de axe, teclado, lector de pantalla y pruebas a 390/768 px. |
| A07 CI/CD y respaldo | Parcial | CI, Pages, gitleaks y script de respaldo existen. `.github/dependabot.yml` tiene `updates: []`; faltan dependabot semanal, `supabase db lint` y pin de acciones por SHA. |

Los prompts A01-A07 se conservan mientras haya trabajo pendiente. Se retiraran cuando cada tarea este completa y validada.

## Criterios CA y CP trazables a los prompts

El estado de abajo es respecto al comportamiento descrito por los prompts, no una certificación de la especificación fuente. El resto de CA-001..016 y CP-001..015 queda **BLOQUEADO POR ESPECIFICACIÓN AUSENTE** hasta recuperar `docs/ESPECIFICACION_v0_2.md`.

| Referencia | Estado provisional | Evidencia |
|---|---|---|
| CA-003, CA-004 | Parcial | Conciliación y `supabase/tests/database/60_reconciliation.sql`; pgTAP no ejecutado en este entorno. |
| CA-005 | Parcial | Resultados en `src/pages/ResultsLoadPage.tsx`; casos de punta a punta no ejecutados. |
| CA-006, CA-007 | Parcial por DP-007..010 | `src/pages/RegulationsPage.tsx`; comparación de conformidad intencionalmente ausente. |
| CA-008..011 | Parcial | Emisión/snapshot en migración `20261019190000_rsa_issuance_snapshot.sql`; no se corrió E2E. |
| CA-013, CA-016 | Parcial | Flujo de revisión y segregación implementado; falta evidencia E2E con usuarios distintos. |
| CP-002 | Parcial | `ResultsLoadPage.tsx`; falta E2E. |
| CP-003..007 | Parcial | Reconciliación y prueba SQL correspondiente; no ejecutada aquí. |
| CP-009, CP-010 | Parcial | Migraciones de RSA/emisión; falta E2E y comprobación del snapshot contra cambio de catálogo. |
| CP-012 | Parcial | Flujo de revisión/aprobación; falta E2E mult usuario. |
| CP-013 | Parcial | Módulo externo; falta E2E de recepción externa y vencimiento. |
| CP-014 | Parcial | Recepción implementada; falta E2E. |
| CP-015 | Parcial | Normativa confirmable; decisiones de conformidad siguen pendientes. |

## Decisiones funcionales visibles en las fuentes

No se resolvieron decisiones de negocio dentro del código. Entre las que siguen explícitamente pendientes están DP-001, DP-002, DP-003, DP-007..010, DP-012..014, DP-016, DP-022..024, DP-026..027, DP-031..032 y DP-033. El estado autoritativo debe confirmarse en `pending_decisions`; no se importó una lista fabricada al faltar sección 18 de la especificación.

## Próximos pasos necesarios

1. Recuperar la especificación v0.2 y contrastar cada RF/RNF, CA, CP y glosario.
2. Ejecutar el plan E2E manual de `TEST_REPORT.md` con usuarios de prueba por rol en un proyecto Supabase dedicado.
3. Ejecutar `npx supabase test db` con Docker local o contra un proyecto de pruebas dedicado (nunca producción).
4. Resolver formalmente las decisiones de negocio listadas antes de activar las funciones dependientes.
