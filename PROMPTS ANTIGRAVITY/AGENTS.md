# AGENTS.md - reportSysDev
Reglas completas del proyecto: .github/copilot-instructions.md (leerlas SIEMPRE antes de empezar). Especificacion: docs/ESPECIFICACION_v0_2.md.

Resumen: React + TypeScript + Vite en GitHub Pages; Supabase (PostgreSQL, Auth, Storage, RPC, Edge Functions). Sin service_role en el frontend. RLS en toda tabla. Sin hard delete. No inventar reglas de negocio, limites, formulas ni personas; lo pendiente queda como "Pendiente de definicion funcional" (DP-xxx).

Convivencia con otros agentes (GitHub Copilot trabaja en paralelo en los modulos principales):
- Trabaja SOLO en tu rama (feature/<tarea>) y abre un PR; nunca hagas push directo a main.
- No edites modulos ajenos salvo en el punto de extension indicado en tu tarea.
- Migraciones nuevas con timestamp propio; nunca edites una migracion ya aplicada.
- Antes de reportar: npm run build, npm run lint y npm test sin errores.
