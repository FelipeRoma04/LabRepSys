insert into public.roles (code, name, description)
values
  ('ADMIN', 'Administrador', 'Administra usuarios, permisos y configuración del sistema.'),
  ('ADMIN_TECNICO', 'Administrador técnico', 'Gestiona despliegue y soporte; no aprueba resultados.'),
  ('COMERCIAL', 'Comercial', 'Acceso funcional asignado al área comercial.'),
  ('MUESTREO', 'Muestreo', 'Acceso funcional asignado al trabajo de muestreo.'),
  ('RECEPCION', 'Recepción', 'Acceso funcional asignado a la recepción de muestras.'),
  ('ANALISTA', 'Analista', 'Acceso funcional asignado al análisis y preparación de resultados.'),
  ('JEFE_TECNICA_CALIDAD', 'Jefe de técnica y calidad', 'Revisa y aprueba conforme a permisos definidos.'),
  ('AUDITOR', 'Auditor', 'Acceso de lectura de auditoría y datos autorizados.')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description;

insert into public.app_settings (key, value, description)
values
  (
    'document.format.COT',
    to_jsonb('COT-NNNN-AAAA'::text),
    'Formato de visualización de consecutivos de cotización.'
  ),
  (
    'document.format.RSA',
    to_jsonb('RSA NNNN-AAAA'::text),
    'Formato de visualización de consecutivos de reportes RSA.'
  ),
  (
    'document.format.INF',
    to_jsonb('INF-NNNN-AAAA'::text),
    'Formato de visualización de consecutivos de informes técnicos.'
  ),
  (
    'document.counter_policy',
    '{"annual_reset":"configurable","reservation_moment":"PENDIENTE_DP-002"}'::jsonb,
    'Política de reinicio anual y momento de reserva pendiente de DP-002.'
  )
on conflict (key) do nothing;