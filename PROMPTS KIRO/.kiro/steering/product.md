---
inclusion: always
---
# Producto: reportSysDev

Sistema web de reportes de resultados de laboratorio del LAA (Laboratorio de Analisis Ambiental) de Grupo Sierra Alta, acreditado NTC-ISO/IEC 17025:2017. Reemplaza el proceso en Excel por una aplicacion controlada y trazable: cotizacion, recepcion de muestras, datos de campo, resultados propios y subcontratados, conciliacion, normativa, revision, aprobacion y emision del RSA.

Especificacion completa: #[[file:docs/ESPECIFICACION_v0_2.md]]

## Reglas que ninguna spec puede romper
- No inventar reglas de negocio, limites normativos, formulas ni personas. Lo pendiente se muestra como "Pendiente de definicion funcional" y cita su DP-xxx.
- "< 0,040" se guarda con operador, valor numerico y texto original. Nunca se reduce a 0,040 ni a 0.
- Sin dato (no aplica, no reporta, no especifica, pendiente) es distinto de cero.
- Lo heredado de cotizacion o recepcion es una sugerencia con confirmacion humana.
- Quien prepara un RSA no puede aprobarlo. Un emitido es inmutable.
- Sin conversion de unidades, normalizacion de incertidumbre, redondeo, sumatorias BTEX/HAP ni conformidad automatica.

## Roles (codigos exactos)
ADMIN, ADMIN_TECNICO, COMERCIAL, MUESTREO, RECEPCION, ANALISTA, JEFE_TECNICA_CALIDAD, AUDITOR.
