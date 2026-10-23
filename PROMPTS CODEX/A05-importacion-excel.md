# A05 - Importacion desde Excel (catalogos y libro de recepcion)

Prerrequisito: Copilot ya hizo p04 (catalogos y muestras con importacion CSV).
Rama: feature/a05-importacion-excel
Puede tocar: src/features/import/**, un unico boton "Importar Excel" en las pantallas de ensayos y muestras (punto de extension), pruebas.
No tocar: validaciones de negocio existentes; reutilizalas.

OBJETIVO
RF-ADM-003 y RF-REC-007: permitir cargar .xlsx ademas de CSV, con vista previa e informe de errores, durante la transicion desde Excel.

REQUISITOS
- Usar exceljs (MIT, mantenida). PROHIBIDO el paquete xlsx de npm.
- Leer solo datos: ignorar macros, formulas se leen como valor calculado, NO ejecutar enlaces externos ni conexiones.
- Flujo: subir archivo; elegir hoja; mapear columnas; vista previa; validar por fila con las reglas existentes (codigo AG####, fechas improbables, cliente existente, ensayo SA); informe de errores descargable; confirmar importacion.
- Idempotente: reimportar el mismo archivo no duplica registros (hash del archivo y clave natural).
- Libro de recepcion (SA-OP-LAA-TEC-FOR.5.3): hojas RECEPCION MUESTRAS, LABORATORIO y REPORTES. No migrar las observaciones de texto libre automaticamente: las filas con laboratorio externo en OBSERVACIONES quedan marcadas "estructurar manualmente".
- Fechas: serial de Excel convertido con advertencia si el ano es atipico; nunca corregir en silencio.
- Limite de tamano y de filas configurable; procesar por lotes sin congelar la interfaz.

ACEPTACION
- Pruebas con un xlsx pequeno de ejemplo (sin datos reales): filas validas, invalidas y duplicadas; AG00106 rechazado.
- Todo lo importado queda auditado con el nombre y hash del archivo.
