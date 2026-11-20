-- Parámetros de fecha de entrega (equivalente a WORKDAY.INTL del libro de recepción).
-- delivery.weekend_workday_intl queda en null (JSON) a propósito: es una decisión de
-- negocio pendiente (¿el sábado es hábil?) que se toma revisando la macro. Mientras sea
-- null, la aplicación NO calcula fechas y muestra el aviso WEEKEND_PENDING.
insert into public.app_settings (key, value, description)
values
  (
    'delivery.weekend_workday_intl',
    'null'::jsonb,
    'Días no hábiles con el código de WORKDAY.INTL de la macro: 1 = sábado y domingo, 11 = solo domingo, o 7 dígitos lunes→domingo como "0000011". Pendiente de confirmar.'
  ),
  (
    'delivery.laboratory_business_days',
    to_jsonb(15),
    'Días hábiles que tiene el laboratorio subcontratado para entregar resultados (valor del libro de recepción).'
  ),
  (
    'delivery.client_business_days',
    to_jsonb(20),
    'Días hábiles comprometidos con el cliente para entregar el reporte (valor del libro de recepción).'
  )
on conflict (key) do nothing;
