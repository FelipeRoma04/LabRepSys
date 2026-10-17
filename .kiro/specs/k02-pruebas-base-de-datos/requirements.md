# Requirements - K02 Pruebas automaticas de seguridad en PostgreSQL (pgTAP)

## Introduccion
La seguridad real vive en RLS y RPC. Esta spec crea pruebas SQL que fallan si una politica, funcion o restriccion se rompe. Las pruebas se agregan por modulo conforme existan las migraciones.

## Requisito 1 - Reglas globales
1.1 El sistema de pruebas DEBERA fallar SI alguna tabla del esquema public no tiene RLS activo.
1.2 DEBERA fallar SI existe una politica de escritura con USING (true) o WITH CHECK (true).
1.3 DEBERA fallar SI una funcion security definer no fija search_path.
1.4 DEBERA fallar SI una vista del esquema public no usa security_invoker.
1.5 DEBERA fallar SI algun bucket de Storage es publico.

## Requisito 2 - Roles y acceso
2.1 PARA cada tabla y cada rol (8 roles mas usuario inactivo y usuario sin rol) las pruebas DEBERAN verificar lectura y escritura permitidas y denegadas segun la especificacion.
2.2 Un usuario NO DEBERA poder asignarse roles ni activar su propio perfil.
2.3 audit_logs NO DEBERA aceptar UPDATE ni DELETE de ningun usuario funcional.

## Requisito 3 - Reglas de dominio en base de datos
3.1 AG0346 DEBERA ser aceptado y AG00106 rechazado.
3.2 Una medicion con value_state distinto de VALUE y numero NO NULL DEBERA ser rechazada; VALUE con 0 DEBERA ser aceptado.
3.3 next_counter DEBERA devolver numeros consecutivos sin repetir bajo llamadas concurrentes.
3.4 Una cotizacion con un contacto de otro cliente DEBERA ser rechazada.
3.5 Un ensayo usado NO DEBERA permitir UPDATE tecnico: debe crear version nueva.
3.6 transition_report y issue_report DEBERAN devolver {ok:false} y dejar auditado el intento cuando un analista, o quien preparo el reporte, intente aprobar.
3.7 Un reporte emitido, su snapshot y sus filas relacionadas NO DEBERAN poder modificarse ni borrarse.

## Requisito 4 - Ejecucion
4.1 Las pruebas DEBERAN ejecutarse con "supabase test db" y estar organizadas en supabase/tests/database.
4.2 Las pruebas de un modulo aun inexistente DEBERAN omitirse de forma explicita, no fallar.
