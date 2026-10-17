---
inclusion: always
---
# Estructura del proyecto

src/components (UI compartida), layouts, pages, features/<modulo>, services (acceso a Supabase, uno por modulo), hooks, types, lib (supabase, format, utilidades).
supabase/migrations, supabase/functions, supabase/tests, supabase/seed.sql.
docs/ (especificacion y notas). e2e/ (pruebas end-to-end).

## Convivencia con otros agentes
GitHub Copilot construye los modulos principales y otra herramienta puede trabajar en paralelo. Cada spec de Kiro trabaja en su rama feature/<spec>, abre PR y no edita modulos ajenos salvo en el punto de extension que su spec indica. Migraciones con timestamp propio.

## Reglas para generar specs
Usar las specs ya escritas en .kiro/specs; no regenerarlas desde cero. Mantener requirements, design y tasks minimos: sin diagramas ni planes de prueba extra. Maximo 8 criterios de aceptacion por requisito.
