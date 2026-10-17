# Tareas para Kiro (reportSysDev)

Contenido: carpeta .kiro con 3 archivos de steering y 6 specs ya escritas (requirements, design, tasks).

## Como usarlo
1. Copia la carpeta .kiro a la raiz del repositorio (junto a .github y docs). Debe existir docs/ESPECIFICACION_v0_2.md y .github/copilot-instructions.md porque el steering los referencia.
2. Abre el proyecto en Kiro. Las specs aparecen en el panel Specs y el steering en Agent Steering.
3. Crea una rama por spec (feature/k01-formato, etc.). Abre la spec, revisa requirements y design, y ejecuta las tareas de tasks.md. Si Kiro propone regenerarlas, indicale que use las existentes.
4. Revisa el diff de cada tarea, ejecuta build, lint y test, y abre un PR.

## Cuando empezar cada spec
- K01 formato y localizacion: ya, antes de seguir con modulos nuevos de Copilot (despues agrega a copilot-instructions la linea "Mostrar numeros, fechas y resultados con src/lib/format").
- K02 pruebas de base de datos: tras p01; completar el resto a medida que Copilot termine cada modulo.
- K03 editor de plantillas: tras p02 y antes de p12.
- K04 observabilidad: tras p01.
- K05 asistente de migracion: tras p02 y p04.
- K06 ayuda contextual: al final, cuando existan los estados y roles definitivos.

## Nota
Las specs de Kiro no incluyen tareas de documentacion ni despliegue (su flujo las excluye). El CI/CD y el respaldo estan en la carpeta de Antigravity (A07).
Lo que depende de decisiones de Calidad o Legal sigue sin asignarse: ver NO-ASIGNAR-TODAVIA.md de la carpeta de Antigravity.
