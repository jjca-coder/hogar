-- ============================================================
-- HOGAR — migración 03: frecuencia de los hábitos
-- Ejecutar en el SQL Editor después de las anteriores.
--   daily    -> todos los días
--   weekdays -> solo los días marcados en weekdays (ISO: 1=lunes … 7=domingo)
--   weekly   -> target_count veces por semana, cualquier día
--   monthly  -> target_count veces al mes, cualquier día
-- ============================================================

alter table public.habits
  add column if not exists frequency text not null default 'daily'
    check (frequency in ('daily', 'weekdays', 'weekly', 'monthly')),
  add column if not exists target_count int not null default 1
    check (target_count between 1 and 31),
  add column if not exists weekdays int[] not null default '{1,2,3,4,5,6,7}';
