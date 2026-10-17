# Requirements - K03 Editor de plantillas de reporte

## Introduccion
RF-PDF-001: gestionar codigo, version, fecha de aprobacion, logos, textos, firma y reglas de paginacion de la plantilla del RSA. No se asume que la version oficial sea la 8 (DP-001).

## Requisito 1 - Edicion
Como administrador funcional, quiero editar la configuracion de una plantilla, para que el reporte use textos y columnas aprobados.
1.1 El sistema DEBERA permitir editar encabezado, textos fijos, declaraciones, pie, columnas de la tabla de resultados (cuales y en que orden), numero de columnas de limites y reglas de paginacion.
1.2 El sistema DEBERA validar la configuracion contra un esquema tipado antes de guardar y mostrar errores por campo.
1.3 Los logos y la imagen de firma DEBERAN guardarse en un bucket privado y referenciarse por ruta, nunca incrustados en la configuracion.
1.4 El sistema NO DEBERA inventar textos legales: los campos arrancan vacios o con el contenido que el usuario cargue.

## Requisito 2 - Versionado y aprobacion
2.1 Una plantilla en DRAFT DEBERA poder editarse libremente.
2.2 CUANDO la Jefa Tecnica y Calidad apruebe una plantilla ENTONCES el sistema DEBERA pasarla a APPROVED con fecha de aprobacion y aprobador, y volverla inmutable.
2.3 CUANDO se quiera cambiar una plantilla APPROVED ENTONCES el sistema DEBERA crear una version nueva en DRAFT copiando la anterior.
2.4 El sistema DEBERA permitir retirar una plantilla (RETIRED) sin borrarla; los reportes emitidos conservan la que usaron.
2.5 Solo plantillas APPROVED DEBERAN poder elegirse en el constructor de RSA.

## Requisito 3 - Vista previa
3.1 El sistema DEBERA mostrar una vista previa con datos DEMO y marca BORRADOR, sin tocar datos reales.
3.2 Si el navegador no soporta una regla de paginacion, la vista previa DEBERA avisarlo.

## Requisito 4 - Contrato para el PDF
4.1 El sistema DEBERA publicar el tipo TemplateConfig en src/types/templateConfig.ts para que la vista imprimible y el generador en servidor lo consuman.
4.2 Cada aprobacion y cambio DEBERA quedar auditado.
