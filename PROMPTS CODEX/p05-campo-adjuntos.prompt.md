---
description: Datos de campo y adjuntos
---

Lee .github/copilot-instructions.md. Continúa desde el estado ACTUAL. Implementa DATOS DE CAMPO y ADJUNTOS de muestras. Referencia: docs/ESPECIFICACION_v0_2.md secciones 6.4 y RF-REC-009. Ruta /muestras/datos-de-campo y secciones en el detalle de muestra.

TABLAS (migración nueva; estándar + RLS):
- field_parameters(code, name, default_unit, active): catálogo configurable. Seed: ph, conductivity, temperature, dissolved_oxygen, flow_rate, ssed.
- sample_field_data(sample_id unique, latitude_original text, longitude_original text, latitude_normalized numeric, longitude_normalized numeric, coordinate_state, collected_by, notes)
- sample_field_measurements(sample_id, field_parameter_id, value_state VALUE|NOT_APPLICABLE|NOT_REPORTED|NOT_SPECIFIED|PENDING, numeric_value numeric, unit, original_text)
  CHECK: numeric_value NOT NULL solo si value_state = VALUE. Un cero válido (VALUE, 0) es distinto de "sin dato". Nunca uses 0 para representar ausencia.
- sample_attachments(sample_id, attachment_type SOLICITUD|CADENA_CUSTODIA|FORMATO_CAMPO|FOTO|OTRO, storage_path, file_name, file_type, file_size, sha256, uploaded_by, withdrawn boolean, withdrawn_reason)

COORDENADAS: guardar siempre el texto original. Normalizar a grados decimales solo si el formato es inequívoco (decimal o grados-minutos-segundos); si no, dejar normalized en NULL y mostrar advertencia. Validar rangos (latitud -90 a 90, longitud -180 a 180).

FORMULARIO: mobile-first (campos grandes, un bloque por pantalla en celular), selector de estado por cada medición, parámetros adicionales desde field_parameters. Debe funcionar en celular y tablet. Operación sin conexión queda fuera de alcance (DP-026): no la implementes.

ADJUNTOS
- Subir al bucket privado source-files con ruta samples/{sample_id}/{uuid}-{nombre_seguro}.
- Validar tipo (pdf, jpg, png, csv, xlsx), tamaño máximo configurable en app_settings (por defecto 10 MB) y nombre sanitizado.
- Calcular SHA-256 en el navegador (crypto.subtle) y guardarlo.
- Descarga solo por signed URL de corta duración.
- Las fotos como evidencia dependen de una política pendiente (RF-CAM-005): configurable con un interruptor en app_settings.
- Sin borrado físico: marcar como retirado con motivo.

RLS Y AUDITORÍA
- MUESTREO crea y edita datos de campo hasta la recepción; después solo mediante RPC con motivo (queda en auditoría).
- RECEPCION y ADMIN gestionan adjuntos. ANALISTA, JEFE_TECNICA_CALIDAD y AUDITOR leen.
- Políticas de Storage por rol y ruta.

PRUEBAS: medición con valor 0 válido vs NOT_REPORTED, coordenada decimal, coordenada ambigua, adjunto válido, adjunto de tipo no permitido, adjunto sobre el tamaño máximo, signed URL, edición tras recepción sin motivo (rechazada), uso en celular (viewport 390 px), permisos. npm run build. Detente y reporta.
