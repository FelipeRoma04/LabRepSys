# Coordinacion Copilot + Antigravity

Estas tareas son piezas INDEPENDIENTES de los modulos que construye Copilot (prompts p01 a p14). Cada una indica de que prompt de Copilot depende.

## Reglas para no pisarse
1. Una rama por tarea: feature/a01-adaptadores-pdf, feature/a02-pdf-servidor, etc. Copilot sigue en su rama (o main) y tu integras con PR.
2. Cada tarea lista "Puede tocar" y "No tocar". Respetalo.
3. Haz merge de las ramas de Antigravity solo cuando el prompt de Copilot del que dependen ya este en main y compile.
4. Si ambas herramientas crean migraciones, usa timestamps distintos y revisa el orden antes del merge.
5. Despues de cada merge: npm run build, npm test y probar la pantalla afectada.

## Cuando empezar cada tarea
- A01 adaptadores PDF: despues de p07
- A02 PDF en servidor: despues de p12
- A03 pruebas E2E: puede empezar tras p04 y crecer hasta p14
- A04 busqueda global y exportacion: despues de p11
- A05 importacion Excel: despues de p04
- A06 accesibilidad: despues de p05 y de nuevo al final
- A07 CI/CD y respaldo: cuando quieras desplegar

## Datos sensibles
Los PDF de laboratorios y los datos de clientes son confidenciales. NO los subas a un repositorio publico (GitHub Pages gratuito exige repo publico). Usa copias anonimizadas como fixtures o guardalas fuera del repo.

## Como dar una tarea a Antigravity
Copia AGENTS.md a la raiz del repo. Abre el Agent Manager, crea una tarea nueva, y pega el contenido del archivo Axx. Pidele que te muestre el plan antes de ejecutar y revisa los cambios antes de aceptar.
