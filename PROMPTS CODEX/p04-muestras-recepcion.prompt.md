---
description: Muestras y recepcion
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa MUESTRAS y RECEPCIÓN (sin datos de campo ni resultados). Referencia: docs/ESPECIFICACION_v0_2.md secciones 6.3, 5 (pasos 3 y 4), RN-001 y CP-014. Reemplaza los placeholders de /muestras, /muestras/recepcion y /muestras/buscar.

TABLAS (migración nueva; estándar + RLS):
- samples(code, client_id, quote_id nullable, matrix_id, plan_code, sampling_point, sampled_at, received_at, status, observations)
- sample_receptions(sample_id, containers, preservation jsonb, received_by, chain_of_custody_verified boolean, arrival_conditions, deviations, client_consulted_on_deviation boolean, request_review jsonb, signature_reference)
- sample_tests(sample_id, test_id, execution_type SA|SUBCONTRACTED, assigned_laboratory_id, status)
- sample_events(sample_id, event_type, detail jsonb, created_at): historial básico

CÓDIGO DE MUESTRA: el patrón se lee de app_settings (por defecto ^AG[0-9]{4}$). AG0346 es válido; AG00106 es inválido (error de digitación observado). Único. Prefijos por matriz y reinicio anual están pendientes (DP-032): no los inventes. Valida en el frontend Y con CHECK o trigger en la base de datos.

ASISTENTE DE RECEPCIÓN (por pasos): 1 Identificación; 2 Cliente y cotización; 3 Muestreo y recepción; 4 Preservación y recipientes; 5 Ensayos solicitados; 6 Asignación de laboratorio (SA o subcontratado); 7 Cadena de custodia y condiciones de llegada; 8 Revisión de la solicitud; 9 Revisión y guardado.
- Al elegir una cotización vigente, mostrar cliente, ensayos y normativa como "Sugerido desde cotización" y exigir confirmación explícita. Nada se aplica en silencio.
- Cadena de custodia (RF-REC-013): si hay desviación, exigir constancia de la consulta al cliente antes de avanzar.
- Revisión de la solicitud (RF-REC-012): registrar verificación de capacidad y métodos, y la regla de decisión acordada cuando el cliente pida declaración de conformidad.
- Ensayos subcontratados: exigir laboratorio asignado y advertir si el ensayo está fuera del alcance acreditado del laboratorio.
- Fechas (RF-REC-008): advertir fechas futuras, improbables o con año atípico, sin corregirlas automáticamente.
- Preservación: refrigeración, congelación, pH, nivel y otros configurables.

CAMBIOS POSTERIORES (RF-REC-010): tras la recepción, editar exige motivo mediante una RPC que guarda old/new en auditoría. RLS no permite UPDATE directo.

BÚSQUEDA (/muestras/buscar): por código, cliente, NIT, cotización, plan, punto, fecha y estado; filtros combinables. Detalle de muestra con recepción, ensayos, laboratorios y eventos. Las secciones de campo y adjuntos llegan en el siguiente prompt: muéstralas vacías con el texto "Disponible en el siguiente módulo", sin datos falsos.

IMPORTACIÓN TRANSITORIA (RF-REC-007): importar muestras desde CSV con vista previa e informe de errores por fila (código inválido, fecha dudosa, cliente no encontrado). No ejecutar enlaces externos.

RLS Y AUDITORÍA: RECEPCION y ADMIN crean y editan; ANALISTA, MUESTREO, JEFE_TECNICA_CALIDAD y AUDITOR leen. Audita crear, editar y cambios de estado.

PRUEBAS: AG0346 válido, AG00106 rechazado, código duplicado, cotización sugerida y confirmada, desviación sin consulta al cliente, fecha futura, subcontratado sin laboratorio, cambio posterior sin motivo (rechazado), búsqueda, recarga, permisos. npm run build. Detente y reporta.
