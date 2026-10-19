# Estado de implementación

Revisión: 2026-10-19. Fuente de trabajo: `PROMPTS CODEX/p01` a `p14`, specs K01-K06 y código/migraciones actuales.

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
| Laboratorios externos | Parcial | Hay registro y vista de pendientes; asignaciones y notificaciones de asignación requieren modelo de destinatarios que no está especificado. |
| Resultados e importación | Parcial | Importación y captura existen; adaptadores PDF son explícitamente stubs y OCR queda pendiente (DP-023). |
| Conciliación | Implementado según prompts | `ReconciliationPage.tsx`, migración `20261019120000_reconciliation_workflow.sql`; ejecutar pgTAP en proyecto de pruebas. |
| Normativa | Parcial por decisiones | Se muestran límites y confirmaciones; no se calcula conformidad ni regla de decisión (DP-007 a DP-010). |
| Validaciones | Implementado según prompts | Servicios y pruebas unitarias; flujo completo requiere prueba manual integrada. |
| Flujo RSA, revisión y aprobación | Implementado según prompts | `ReportBuilderPage.tsx`, transiciones/RLS en migraciones; aprobación segregada. |
| Emisión PDF y snapshot | Implementado según prompts | `ReportPrintPage.tsx`, `reports.ts`, migraciones `20261019180000` y `20261019190000`. Firma criptográfica y diseño oficial dependen de decisiones existentes (DP-012, DP-022). |
| Dashboard, administración, auditoría | Implementado según prompts | `DashboardPage.tsx`, `AdministrationPage.tsx`, `AuditPage.tsx`; agrega notificaciones internas, no email/Teams (DP-027). |
| Ayuda contextual K06 | Parcial | Botón, diálogo accesible, búsqueda, contexto y pruebas están implementados. Glosario/roles no pueden certificarse contra sección 19/4 sin `ESPECIFICACION_v0_2.md`; el panel informa esta limitación. |
| Cierre QA p14 | Parcial | Rutas inspeccionadas y checks ejecutados; falta E2E con usuarios/datos demo y pgTAP local. Lista manual en `TEST_REPORT.md`. |

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
