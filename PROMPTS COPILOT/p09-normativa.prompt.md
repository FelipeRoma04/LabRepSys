---
description: Normativa y limites
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa NORMATIVA y LÍMITES. Referencia: docs/ESPECIFICACION_v0_2.md sección 6.9, RN-008, CA-006, CA-007 y CP-015. Ruta /normativa.

TABLAS (migración nueva; estándar + RLS):
- regulations(code, name, source_reference)
- regulation_versions(regulation_id, version_name, valid_from, valid_until, status DRAFT|ACTIVE|RETIRED)
- regulation_activities(regulation_version_id, article, activity, discharge_type ARD|ARnD|NA, description)
- regulation_limits(activity_id, test_id, limit_operator, limit_value numeric, limit_text, unit, special_value N_A|N_E|N_R|NOT_SPECIFIED|ANALYSIS_AND_REPORT|NONE)
- sample_regulations(sample_id, regulation_version_id, activity_id, source QUOTE|MANUAL, suggested_from_quote_id, confirmed boolean, confirmed_by, confirmed_at, column_order)

CATÁLOGO INICIAL: Resolución 631 de 2015 (MADS), estructura de los artículos 8 a 16. NO inventes ni completes límites: crea la estructura y una importación CSV con plantilla descargable e informe de errores para que el usuario cargue los valores reales. Todo valor importado queda en DRAFT hasta que un ADMIN lo active.

REGLAS
- Valores especiales soportados: N.A., N.E., N.R., No especificado, Análisis y reporte. No son 0 ni vacío.
- Un reporte puede tener varias columnas normativas (sample_regulations.column_order).
- Distinguir ARD y ARnD; advertir cuando la matriz registrada en recepción no coincida con el artículo seleccionado (RF-NOR-008).
- Normativa sugerida desde la cotización: mostrar "Sugerida desde cotización" y exigir confirmación del analista (confirmed_by y confirmed_at). Sin confirmar no se puede avanzar.
- Si la normativa elegida difiere de la acordada en la cotización: alerta con ambas fuentes y decisión registrada con motivo (se integra al flujo de conciliación como issue).
- Los límites se referencian por regulation_version_id: un cambio posterior crea una versión nueva y no altera lo ya usado.

NO IMPLEMENTAR (mostrar un panel "Pendiente de definición funcional" que cite DP-007, DP-008, DP-009 y DP-010): declaración automática de conformidad, comparación resultado vs límite como cumple o no cumple, regla de decisión, normalización de incertidumbre, sumatorias BTEX/HAP y redondeo. Sí se puede MOSTRAR el límite junto al resultado sin concluir nada.

PANTALLAS: lista de normas, versiones, actividades por artículo, límites por ensayo con filtros; confirmación de normativa por muestra.

RLS Y AUDITORÍA: ADMIN administra la normativa; ANALISTA confirma la normativa de muestras; los demás leen. Audita creación, importación, activación, cambio de versión y confirmación.

PRUEBAS: versión nueva sin alterar la anterior, valor especial N.R. mostrado, ARD vs ARnD con matriz incoherente (advertencia), normativa sugerida sin confirmar (bloquea), diferencia contra la cotización, importación con errores, dos columnas normativas, permisos. npm run build. Detente y reporta.
