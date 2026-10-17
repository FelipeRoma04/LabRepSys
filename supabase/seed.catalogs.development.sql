insert into public.laboratories (code, name, laboratory_type)
values
  ('SIERRA_ALTA', 'Sierra Alta', 'INTERNAL'),
  ('AGQ', 'AGQ', 'EXTERNAL'),
  ('CHEMILAB', 'Chemilab', 'EXTERNAL'),
  ('IHA', 'IHA', 'EXTERNAL'),
  ('SGS', 'SGS', 'EXTERNAL'),
  ('AIRWA', 'AIRWA', 'EXTERNAL'),
  ('BIOPOLAB', 'Biopolab', 'EXTERNAL')
on conflict (code) do nothing;
