---
description: Carga de resultados y parseo
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa CARGA DE RESULTADOS (archivo, pegado y digitación) y RESULTADOS. NO implementes todavía la conciliación completa (siguiente prompt). Referencia: docs/ESPECIFICACION_v0_2.md secciones 6.7, 6.8, RN-005, CA-005 y CP-002. Rutas /resultados/carga y /resultados/pendientes.

TABLAS (migración nueva; estándar + RLS):
- result_imports(sample_id, laboratory_id, source_type PDF|PASTE|MANUAL, storage_path, file_name, file_hash, adapter_code, adapter_version, import_status, raw_payload jsonb)
- import_rows(result_import_id, row_number, external_parameter, external_unit, external_result, mapped_test_id nullable, mapping_status EXACT|SUGGESTED|UNMAPPED|CONFIRMED, validation_messages jsonb, confirmed)
- results(sample_id, test_id, laboratory_id, operator, numeric_value, original_text, reported_text, unit, lcm, uncertainty_text, method_text, technique_text, accreditation_type, analysis_start, analysis_end, source_import_id nullable, source_page, entry_mechanism, status IMPORTED|CONFIRMED|CORRECTED|REJECTED, entered_by)
- result_corrections(result_id, old_data jsonb, new_data jsonb, reason NOT NULL, corrected_by, created_at)
- Idempotencia (RF-IMP-008): reprocesar una importación, o subir el mismo file_hash para la misma muestra y laboratorio, NO duplica resultados; advertir y ofrecer reprocesar.

PARSEO DE RESULTADOS: función pura en TypeScript con pruebas unitarias (Vitest).
- Soporta operadores <, <=, >, >=, =, rango (ej. 5 - 10), presencia, ausencia y texto cualitativo; coma o punto decimal.
- "< 0,040" produce operator "<", numeric_value 0.040, original_text "< 0,040". Nunca se reduce a 0.040 ni a 0.
- Lo que no se pueda interpretar queda como texto cualitativo pendiente de confirmación; no se adivina.

CARGA
1. Archivo: guardar el original sin modificar en source-files (ruta por muestra) con SHA-256.
2. Pegado desde Excel: grilla con mapeo de columnas, vista previa y validación por fila.
3. Digitación manual con los mismos controles.
- Mostrar el PDF junto a la grilla de revisión para verificación humana.

ADAPTADORES PDF: define la interfaz LabPdfAdapter (id, laboratorio, versión de formato, canHandle, extract) y un registro. Crea los adaptadores AGQ, Chemilab e IHA como STUBS con estado "extracción automática pendiente": no deben fingir que interpretaron un PDF. El flujo degrada a pegado o digitación manual con el PDF visible. No hay OCR (DP-023): si el PDF no tiene texto, ofrecer captura manual.

CORRESPONDENCIA: relacionar el parámetro externo con el ensayo interno mediante los alias del laboratorio; sin coincidencia exacta exige confirmación humana. Códigos heredados sin mapeo SA no se pueden confirmar.

REGLAS: sin conversión automática de unidades (RF-RES-007); incertidumbre tal como se recibe; los fallos parciales conservan las filas reconocidas y separan las pendientes; el dato original nunca se sobrescribe, la corrección se guarda aparte con motivo.

PANTALLA /resultados/pendientes: ensayos solicitados sin resultado, agrupados por muestra y laboratorio.

RLS Y AUDITORÍA: ANALISTA y ADMIN escriben; JEFE_TECNICA_CALIDAD y AUDITOR leen. Audita importación, confirmación y corrección.

PRUEBAS: "< 0,040", "<=", rango, presencia, texto, coma y punto decimal, mismo archivo dos veces, pegado, manual, fila sin mapeo, corrección sin motivo (rechazada), permisos. npm run build y npm test. Detente y reporta.
