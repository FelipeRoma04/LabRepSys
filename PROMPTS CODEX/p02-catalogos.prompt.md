---
description: Catalogos de ensayos, metodos, matrices, laboratorios
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa solo CATÁLOGOS (sin clientes, muestras ni resultados). Reemplaza los placeholders de /catalogos/* por pantallas funcionales con Supabase real. Referencia: docs/ESPECIFICACION_v0_2.md secciones 6.5, 6.6 y 6.13.

TABLAS (migración nueva; columnas estándar, active y RLS en todas):
- matrices(code, name, description)
- methods(code, name, technique, reference)
- laboratories(code, name, laboratory_type INTERNAL|EXTERNAL, nit, contact_email)
- laboratory_accreditations(laboratory_id, resolution, valid_from, valid_until, scope_notes)
- laboratory_accredited_tests(accreditation_id, test_id): alcance acreditado por ensayo, para advertir cuando un ensayo subcontratado esté fuera de alcance (RF-LAB-004)
- tests(code, parameter_name, default_unit, lcm, uncertainty_text, accreditation_type ACCREDITED|NOT_ACCREDITED|NOT_APPLICABLE, matrix_id, method_id, technique, laboratory_id, observations, version, replaces_test_id, valid_from, valid_until)
- test_aliases(test_id, laboratory_id nullable, alias_type LEGACY_CODE|EXTERNAL_NAME, external_code, external_name)
- test_groups y test_group_members (grupos configurables como BTEX y HAP; no los codifiques en la interfaz)
- report_templates(code, version, approval_date, status DRAFT|APPROVED|RETIRED, configuration jsonb). No asumas que la versión oficial es la 8 (DP-001).
- holidays(date, name): solo catálogo; NO calcules plazos (DP-014).

REGLAS
- Códigos de ensayo vigentes con prefijo SA. Los códigos AGQ, CHEM y SGI se guardan SOLO como test_aliases LEGACY_CODE.
- Clasificación de ejecución derivada (RF-ENS-009): SA acreditado, SA no acreditado o SUBCONTRATADO (laboratorio externo + acreditación vigente). Créala como vista con security_invoker = true.
- Vista v_tests_issuable: un ensayo es emitible solo si tiene parámetro, unidad, método, técnica, matriz, laboratorio, LCM y acreditación definidos y vigentes. Si falta algo, mostrar "No emitible" y los campos faltantes. Valores tipo "FALTA INFO" cuentan como faltantes.
- Versionado: un cambio en campos técnicos (unidad, método, técnica, LCM, incertidumbre, acreditación, matriz, laboratorio) crea una fila nueva con version+1 y replaces_test_id, y cierra la anterior con valid_until. Nunca UPDATE técnico sobre un ensayo ya usado. Sin hard delete.
- Unicidad: (code, version) en tests; code único en el resto.

PANTALLAS (/catalogos/ensayos, laboratorios, metodos, matrices, plantillas, festivos)
- Listar, buscar, filtrar activo/inactivo, crear, detalle, editar, activar/inactivar con confirmación, loading/empty/error y mensajes.
- Ensayos: columnas Código, Parámetro, Matriz, Método, Unidad, LCM, Laboratorio, Acreditación, Versión, Estado, Emitible. Gestión de aliases por laboratorio, grupos y variantes del mismo parámetro por matriz, método, unidad o laboratorio.
- Laboratorios: acreditaciones con vigencia y ensayos del alcance.
- Importación CSV de ensayos con informe de errores por fila (RF-ADM-003). Los registros incompletos se importan como no emitibles.

SEED SOLO DE DESARROLLO: Sierra Alta (INTERNAL), AGQ, Chemilab, IHA, SGS, AIRWA, Biopolab (EXTERNAL). No inventes acreditaciones, métodos ni LCM.

RLS Y AUDITORÍA: ADMIN administra; los demás roles activos leen catálogos activos. Audita CREATE, UPDATE, ACTIVATE, DEACTIVATE y VERSION_CHANGE con log_audit.

FRONTEND: servicios Supabase centralizados por catálogo en src/services, tipos TypeScript consistentes, sin arrays locales como fuente.

PRUEBAS: crear cada catálogo, alias legado, ensayo incompleto marcado no emitible, cambio técnico que genera versión, búsqueda, persistencia tras recarga, permisos. npm run build. Detente y reporta.
