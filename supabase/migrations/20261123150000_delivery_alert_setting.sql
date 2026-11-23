-- Alerta de plazos de entrega próximos a vencer (Bloque B, tarea 8).
-- Parámetro: cuántos días hábiles antes de la fecha de entrega se marca una muestra
-- como "próxima a vencer". El valor 3 es provisional: decisión pendiente del
-- laboratorio. Editable en app_settings sin cambiar código.
insert into public.app_settings (key, value, description)
values (
  'delivery.alert_business_days',
  to_jsonb(3),
  'Días hábiles antes de la fecha de entrega en que una muestra se marca como próxima a vencer. Valor provisional, pendiente de confirmar.'
)
on conflict (key) do nothing;
