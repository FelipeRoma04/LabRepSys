# Requirements - K01 Biblioteca de formato y localizacion

## Introduccion
Una sola biblioteca (src/lib/format) para mostrar numeros, fechas, resultados y estados sin dato en toda la aplicacion, con coma decimal y sin alterar el valor almacenado (RNF-019).

## Requisito 1 - Numeros
Como analista, quiero ver los numeros con coma decimal, para leerlos como en los reportes.
1.1 CUANDO se muestre un valor numerico ENTONCES el sistema DEBERA usar coma decimal (es-CO) sin cambiar el valor guardado.
1.2 El sistema DEBERA conservar exactamente los decimales recibidos y NO redondear (el redondeo esta pendiente, DP-010).
1.3 CUANDO el usuario escriba "0,040" o "0.040" ENTONCES el sistema DEBERA interpretarlos como el mismo numero.
1.4 CUANDO el texto sea ambiguo (por ejemplo "1.234,5" o "1,234.5") ENTONCES el sistema DEBERA pedir confirmacion y NO adivinar.

## Requisito 2 - Resultados
Como analista, quiero que "< 0,040" se muestre tal cual, para no confundirlo con 0,040 ni con cero.
2.1 CUANDO exista texto original ENTONCES el sistema DEBERA mostrarlo sin modificar.
2.2 SI no hay texto original ENTONCES el sistema DEBERA componer operador + numero formateado.
2.3 CUANDO no haya valor ENTONCES el sistema NO DEBERA mostrar 0.

## Requisito 3 - Estados sin dato
3.1 El sistema DEBERA mostrar NOT_APPLICABLE como "N.A.", NOT_REPORTED como "N.R.", NOT_SPECIFIED como "N.E." y PENDING como "Pendiente".
3.2 Un VALUE con numero 0 DEBERA mostrarse como "0".

## Requisito 4 - Fechas y zona horaria
4.1 El sistema DEBERA mostrar timestamptz en la zona configurada (por defecto America/Bogota, por confirmar) y con formato configurable en app_settings.
4.2 CUANDO una fecha sea futura o con ano atipico ENTONCES la biblioteca DEBERA marcarla como sospechosa para que la pantalla advierta, sin corregirla.
4.3 CUANDO una fecha venga como serial de Excel ENTONCES el sistema DEBERA convertirla y marcar la conversion.
