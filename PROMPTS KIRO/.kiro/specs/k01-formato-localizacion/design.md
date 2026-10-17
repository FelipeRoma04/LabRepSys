# Design - K01

Modulos puros en src/lib/format, sin dependencias de React: number.ts (formatNumber, parseLocaleNumber con resultado {ok, value} o {ok:false, reason:"ambiguous"}), result.ts (formatResult), valueState.ts (formatValueState), date.ts (formatDateTime, isSuspiciousDate, fromExcelSerial). Intl.NumberFormat con minimumFractionDigits y maximumFractionDigits iguales a los decimales del dato.
Un hook useFormatSettings lee date_format y timezone de app_settings con valores por defecto si no existen. Punto de extension: nada fuera de src/lib/format y su hook.
Despues de terminar, los modulos nuevos deben importar de src/lib/format; migrar los existentes sera una tarea aparte.
