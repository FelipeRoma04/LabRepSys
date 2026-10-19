# Requirements - K05 Asistente de migracion y calidad de datos historicos

## Introduccion
Seccion 12.2 de la especificacion: mapear codigos heredados (AGQ, CHEM, SGI) a codigos SA, detectar datos historicos inconsistentes y estructurar lo que hoy esta en texto libre. Todo con decision humana; nada se corrige solo.

## Requisito 1 - Mapeo de codigos heredados
Como administrador funcional, quiero mapear cada codigo heredado a su codigo SA, para poder emitir con ensayos del catalogo vigente.
1.1 El sistema DEBERA listar los codigos heredados detectados (en alias, importaciones y resultados) que no tienen mapeo a un ensayo SA.
1.2 El sistema PUEDE proponer coincidencias por similitud de nombre, marcadas como PROPUESTA, y NO DEBERA confirmarlas automaticamente.
1.3 CUANDO el usuario confirme un mapeo ENTONCES el sistema DEBERA crear el alias LEGACY_CODE correspondiente, con responsable, fecha y motivo, y auditarlo.
1.4 El sistema DEBERA permitir rechazar una propuesta con motivo.

## Requisito 2 - Informe de calidad de datos
2.1 El sistema DEBERA generar un informe con: clientes con NIT duplicado o razon social similar; muestras con codigo invalido (por ejemplo AG00106) o fechas improbables; ensayos con campos requeridos incompletos ("FALTA INFO"); envios o muestras con laboratorio externo solo en texto libre.
2.2 CADA hallazgo DEBERA enlazar a la entidad para corregirla con las pantallas y RPC existentes.
2.3 El informe DEBERA poder descargarse en CSV, con celdas protegidas contra inyeccion de formulas.
2.4 El sistema NO DEBERA corregir ni borrar datos desde este asistente.

## Requisito 3 - Seguimiento
3.1 El sistema DEBERA mostrar el avance: total de hallazgos, resueltos y pendientes por categoria.
3.2 Solo ADMIN y JEFE_TECNICA_CALIDAD DEBERAN confirmar mapeos; AUDITOR solo lectura.
