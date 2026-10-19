# Requirements - K04 Observabilidad y manejo de errores

## Introduccion
RNF-016: registrar errores tecnicos, errores de importacion y correlacion de solicitudes, sin exponer detalles al usuario final ni datos sensibles.

## Requisito 1 - Errores del cliente
1.1 CUANDO ocurra un error no controlado ENTONCES el sistema DEBERA mostrar un mensaje claro en espanol sin stack trace y ofrecer volver o reintentar.
1.2 El sistema DEBERA registrar el error en client_error_logs con ruta, mensaje saneado, version de la aplicacion, usuario y correlation_id.
1.3 El saneado DEBERA eliminar correos, tokens, claves y parametros de URL sensibles antes de enviar.
1.4 El sistema DEBERA limitar la frecuencia de envio para no saturar la base.

## Requisito 2 - Correlacion
2.1 Cada accion del usuario que llame una RPC DEBERA generar un correlation_id y pasarlo para que quede en audit_logs.
2.2 Los errores de pantalla DEBERAN mostrar el correlation_id para que soporte lo localice.

## Requisito 3 - Diagnostico
Como administrador tecnico, quiero ver la salud del sistema, para dar soporte sin acceder a datos funcionales.
3.1 El sistema DEBERA ofrecer la pantalla /administracion/diagnostico con errores de los ultimos 7 dias, importaciones fallidas, intentos denegados (de audit_logs) y conteos basicos.
3.2 Solo ADMIN y ADMIN_TECNICO DEBERAN verla; ADMIN_TECNICO NO DEBERA poder aprobar ni modificar datos funcionales.
3.3 client_error_logs DEBERA permitir INSERT a usuarios autenticados activos, lectura solo a ADMIN y ADMIN_TECNICO, y ningun UPDATE ni DELETE.
3.4 El sistema DEBERA permitir filtrar por fecha, ruta y correlation_id.
