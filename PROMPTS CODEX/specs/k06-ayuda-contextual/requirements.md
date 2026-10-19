# Requirements - K06 Ayuda contextual dentro de la aplicacion

## Introduccion
Reducir errores de uso con un panel de ayuda (glosario, estados y que puede hacer cada rol) que usa solo contenido de la especificacion. No se inventa contenido (RNF-011).

## Requisito 1 - Panel de ayuda
1.1 El sistema DEBERA ofrecer un boton de Ayuda en la barra superior que abra un panel lateral.
1.2 El panel DEBERA cerrarse con Escape, tener foco gestionado y ser utilizable con teclado y lector de pantalla.
1.3 El panel DEBERA mostrar ayuda de la pantalla actual cuando exista y, si no, el glosario general.

## Requisito 2 - Glosario
2.1 El glosario DEBERA incluir al menos: LCM, RSA, COT, INF, ARD, ARnD, N.A., N.E., N.R., Snapshot, Rectificacion, Subcontratacion, Cadena de custodia, Regla de decision, con las definiciones de la seccion 19 de la especificacion.
2.2 El sistema DEBERA permitir buscar en el glosario.

## Requisito 3 - Estados y roles
3.1 El sistema DEBERA explicar cada estado del RSA y de la cotizacion, con la misma etiqueta en espanol que usa la interfaz.
3.2 El sistema DEBERA mostrar, segun el rol del usuario, las responsabilidades y restricciones de la seccion 4 de la especificacion.
3.3 CUANDO una funcion dependa de una decision pendiente ENTONCES el panel DEBERA indicarlo como "Pendiente de definicion funcional" y citar el DP correspondiente.
3.4 Todo texto de ayuda que no provenga de la especificacion DEBERA estar ausente; no se redactan reglas nuevas.
