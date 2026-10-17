# Accesibilidad y responsive

Estado: revisión parcial de código. No se certifica conformidad WCAG 2.1 AA.

## Hallazgos revisados y correcciones

- El foco visible global usa `:focus-visible` en `src/styles/index.css`.
- Los diálogos compartidos en `src/components/Modal.tsx` ahora reciben el foco al abrirse, mantienen la tabulación dentro del diálogo, cierran con Escape y devuelven el foco al elemento que los abrió. `src/components/Modal.test.tsx` cubre ese comportamiento.
- La tabla compartida usa encabezados de columna (`scope="col"`) y una leyenda accesible en `src/components/DataTable.tsx`.
- El formulario de datos de campo tiene campos de al menos 44 px y pasa a una columna en anchos móviles en `src/styles/app.css`.

## Pendiente de auditoría automatizada y manual

`axe-core` y `jest-axe` no están instalados en el proyecto. Por ello no se han medido ni se puede afirmar que haya cero violaciones críticas o serias. Tampoco se ha hecho una inspección visual en dispositivos de 390 px, 768 px y escritorio ni una prueba completa con lector de pantalla. Las rutas requieren una sesión de Supabase con los roles indicados para revisar el contenido protegido.

| Ruta | Estado de revisión | Pendiente |
| --- | --- | --- |
| `/` | Código de rutas revisado | Axe con sesión autenticada y revisión de teclado |
| `/clientes` | Usa diálogos compartidos | Axe, etiquetas y errores de todos los formularios |
| `/cotizaciones` | Usa diálogos compartidos | Axe, etiquetas y errores de todos los formularios |
| `/muestras` | Usa diálogos compartidos | Axe, tablas y controles de filtros |
| `/muestras/recepcion` | Marcador de paso accesible en código | Axe y verificación de teclado del asistente |
| `/muestras/datos-de-campo` | Reglas responsive visibles en CSS | Axe y prueba de desbordamiento a 390 px y 768 px |
| `/muestras/buscar` | Comparte la página de muestras | Axe y teclado de filtros |
| `/resultados/carga` | Tabla con encabezados de columna | Axe y lectura de resultados con operador |
| `/resultados/pendientes` | Código de ruta revisado | Axe y teclado |
| `/resultados/conciliacion` | Usa diálogos compartidos | Axe y etiquetas de controles |
| `/normativa` | Código de ruta revisado | Axe y teclado |
| `/validaciones` | Código de ruta revisado | Axe y teclado |
| `/reportes/borradores` | Código de ruta revisado | Axe y teclado |
| `/reportes/revision` | Código de ruta revisado | Axe y teclado |
| `/reportes/aprobados` | Código de ruta revisado | Axe y teclado |
| `/reportes/emitidos` | Código de ruta revisado | Axe y teclado |
| `/catalogos/ensayos` | Usa diálogos compartidos | Axe, etiquetas y errores de formularios |
| `/catalogos/laboratorios` | Usa diálogos compartidos | Axe, etiquetas y errores de formularios |
| `/catalogos/metodos` | Usa diálogos compartidos | Axe, etiquetas y errores de formularios |
| `/catalogos/matrices` | Usa diálogos compartidos | Axe, etiquetas y errores de formularios |
| `/catalogos/plantillas` | Usa diálogos compartidos | Axe, etiquetas y errores de formularios |
| `/catalogos/festivos` | Usa diálogos compartidos | Axe, etiquetas y errores de formularios |
| `/indicadores` | Código de ruta revisado | Axe y teclado |
| `/auditoria` | Código de ruta revisado | Axe y teclado |
| `/administracion` | Código de ruta revisado | Axe y teclado |
| `/administracion/diagnostico` | Código de ruta revisado | Axe y teclado |
| `/administracion/migracion` | Código de ruta revisado | Axe y teclado |
| `/catalogos/plantillas/:id/editar` | Código de ruta revisado | Axe, controles del editor y teclado |

## Cómo completar la auditoría

Instalar y configurar `axe-core` con el corredor de pruebas del proyecto, recorrer las rutas con datos de prueba y roles autorizados, y guardar los resultados por ruta. Corregir primero las violaciones críticas y serias. Repetir las pruebas a 390 px, 768 px y escritorio, incluyendo teclado y lector de pantalla. Actualizar esta tabla con hallazgos y resultados medidos.
