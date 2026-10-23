# A04 - Busqueda global y exportacion autorizada

Prerrequisito: Copilot ya hizo p11 (existen muestras, clientes, cotizaciones y reportes).
Rama: feature/a04-busqueda
Puede tocar: src/features/search/**, un componente de busqueda global en el Topbar (unico punto de extension), una migracion nueva de indices y RPC.
No tocar: RLS existente, otros modulos.

OBJETIVO
RF-BUS-001 y RF-BUS-002: buscar por RSA, muestra, cliente, plan, punto, fecha y estado desde un solo lugar, combinar filtros y exportar lo autorizado.

REQUISITOS
- RPC search_global(q, filtros) en SQL, security invoker (respeta RLS): el usuario solo ve lo que su rol permite. Indices con pg_trgm y de fecha/estado.
- Resultados agrupados por tipo con enlace a la entidad. Busqueda tolerante a tildes y mayusculas. Debounce, loading, empty y error.
- Pagina /buscar con filtros combinables (tipo, estado, rango de fechas, cliente, laboratorio) y paginacion en servidor.
- Exportar a CSV solo las filas visibles al usuario; la exportacion se audita (usuario, filtros, cantidad de filas). Restringir por rol: AUDITOR, JEFE_TECNICA_CALIDAD, ADMIN y ANALISTA; los demas sin exportar.
- Escapar valores del CSV (inyeccion de formulas: prefijar con apostrofe las celdas que empiecen con = + - @).
- Sin librerias xlsx de npm.

ACEPTACION
- Pruebas: un rol sin permiso no ve entidades ajenas; exportacion auditada; formula en una celda queda neutralizada.
- Busqueda sobre 10.000 filas de prueba responde de forma interactiva (documenta la medicion).
