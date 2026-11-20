# Accesibilidad y responsive

Estado: correcciones de teclado, semántica y responsive aplicadas; auditoría parcial. Esto no certifica conformidad WCAG 2.1 AA.

## Verificaciones realizadas

- `npm test -- --maxWorkers=1` pasa (153 pruebas). Las ejecuciones paralelas han tenido un timeout en una prueba de `ResultsLoadPage.test.tsx`, fuera del alcance y sin modificar; esa prueba pasa al ejecutarse sola.
- Se agregaron pruebas axe-core en los estados iniciales de componentes de Clientes, Catálogos (Ensayos), Muestras, Datos de campo, Envíos externos, Reportes externos pendientes, Conciliación y la barra de pestañas de Resultados pendientes. La prueba compartida de `Modal` también ejecuta axe-core y verifica el ciclo de foco, Escape y restauración del foco.
- Las comprobaciones axe se hacen en DOM simulado; desactivan la regla de contraste porque jsdom no representa el renderizado visual. No equivalen a visitar rutas autenticadas ni a una auditoría completa.
- El test de Datos de campo mantiene una operación disponible a 390 px, pero no mide desbordamiento real. No se verificó visualmente el desbordamiento a 390 px o 768 px.
- El foco visible global usa `:focus-visible`. El menú lateral móvil se excluye del foco mientras está cerrado; las pestañas de resultados admiten flechas, Inicio y Fin. Las tablas desplazables se pueden enfocar con teclado y anuncian un nombre; las tablas directas tienen leyendas y encabezados de columna.
- Los avisos dinámicos de éxito, error y validación usan regiones de estado/alerta cuando corresponde. Contraste, lector de pantalla y navegación de teclado en toda la aplicación siguen pendientes de revisión manual.

## Estado por ruta

“Componente probado” significa que una prueba de componente ejecutó axe-core en el estado descrito; no significa que se verificó la ruta real, la sesión/rol, todos los estados de interacción ni el contenido de producción. Las rutas marcadas como no verificadas no se deben considerar accesibles por haber pasado pruebas de componentes vecinos.

| Ruta | Estado comprobado |
| --- | --- |
| `/` | No verificada con axe ni con teclado |
| `/login` | No verificada con axe ni con teclado |
| `/access-denied` | No verificada con axe ni con teclado |
| Ruta no encontrada (`*`) | No verificada con axe ni con teclado |
| `/clientes` | Componente de lista comprobado con axe; estado con datos simulados |
| `/cotizaciones` | No verificada con axe |
| `/muestras` | Componente de lista comprobado con axe; estado con datos simulados |
| `/muestras/recepcion` | No verificada con axe ni con teclado |
| `/muestras/datos-de-campo` | Componente comprobado con axe; el test de 390 px no mide overflow |
| `/muestras/buscar` | No verificada como ruta; comparte componente con Muestras |
| `/resultados/carga` | No verificada ni modificada; excluida explícitamente de este alcance |
| `/resultados/pendientes` | Barra de pestañas comprobada con axe y flechas; contenido hijo simulado en esa prueba |
| `/resultados/conciliacion` | Componente comprobado con axe; estado con datos simulados |
| `/laboratorios-externos` | Componente comprobado con axe; estado con datos simulados |
| `/normativa` | No verificada con axe ni con teclado |
| `/validaciones` | No verificada con axe ni con teclado |
| `/reportes/borradores` | No verificada con axe ni con teclado |
| `/reportes/revision` | No verificada con axe ni con teclado |
| `/reportes/aprobados` | No verificada con axe ni con teclado |
| `/reportes/emitidos` | No verificada con axe ni con teclado |
| `/catalogos/ensayos` | Componente comprobado con axe; estado con datos simulados |
| `/catalogos/laboratorios` | No verificada individualmente con axe |
| `/catalogos/metodos` | No verificada individualmente con axe |
| `/catalogos/matrices` | No verificada individualmente con axe |
| `/catalogos/plantillas` | No verificada individualmente con axe |
| `/catalogos/festivos` | No verificada individualmente con axe |
| `/catalogos/plantillas/:id/editar` | No verificada con axe ni con teclado |
| `/indicadores` | No verificada con axe ni con teclado |
| `/auditoria` | No verificada con axe ni con teclado |
| `/administracion` | No verificada con axe ni con teclado |
| `/administracion/diagnostico` | No verificada con axe ni con teclado |
| `/administracion/migracion` | No verificada con axe ni con teclado |

## Pendiente

Verificar rutas completas con roles autorizados y datos representativos; probar teclado y lector de pantalla; medir overflow horizontal en 390 px y 768 px y revisar contraste con navegador. Añadir los resultados por ruta después de ejecutarlos. La carga de resultados requiere una tarea posterior, fuera del alcance excluido.