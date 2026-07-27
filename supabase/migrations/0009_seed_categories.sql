-- ============================================================
-- 0009 — Categorías del sistema (household_id null = visibles para todos).
-- Jerarquía en dos niveles: grupo → categoría. Iconos con nombres de
-- lucide-react; colores tomados de la paleta de la app.
-- ============================================================

do $$
declare
  g_home uuid; g_food uuid; g_transport uuid; g_life uuid;
  g_leisure uuid; g_health uuid; g_finance uuid; g_income uuid;
begin
  -- ---------- Grupos ----------
  insert into public.categories (id, household_id, parent_id, name, icon, color, kind, is_system, position)
  values
    (gen_random_uuid(), null, null, 'Hogar',       'house',       '#0A84FF', 'expense', true, 1),
    (gen_random_uuid(), null, null, 'Alimentación','utensils',    '#FF9F0A', 'expense', true, 2),
    (gen_random_uuid(), null, null, 'Transporte',  'car',         '#5E5CE6', 'expense', true, 3),
    (gen_random_uuid(), null, null, 'Día a día',   'shopping-bag','#FF375F', 'expense', true, 4),
    (gen_random_uuid(), null, null, 'Ocio',        'popcorn',     '#BF5AF2', 'expense', true, 5),
    (gen_random_uuid(), null, null, 'Salud',       'heart-pulse', '#30D158', 'expense', true, 6),
    (gen_random_uuid(), null, null, 'Finanzas',    'landmark',    '#64D2FF', 'expense', true, 7),
    (gen_random_uuid(), null, null, 'Ingresos',    'trending-up', '#30D158', 'income',  true, 8);

  select id into g_home      from public.categories where name = 'Hogar'        and is_system and parent_id is null;
  select id into g_food      from public.categories where name = 'Alimentación' and is_system and parent_id is null;
  select id into g_transport from public.categories where name = 'Transporte'   and is_system and parent_id is null;
  select id into g_life      from public.categories where name = 'Día a día'    and is_system and parent_id is null;
  select id into g_leisure   from public.categories where name = 'Ocio'         and is_system and parent_id is null;
  select id into g_health    from public.categories where name = 'Salud'        and is_system and parent_id is null;
  select id into g_finance   from public.categories where name = 'Finanzas'     and is_system and parent_id is null;
  select id into g_income    from public.categories where name = 'Ingresos'     and is_system and parent_id is null;

  -- ---------- Categorías ----------
  insert into public.categories (household_id, parent_id, name, icon, color, kind, is_system, position) values
    (null, g_home, 'Alquiler o hipoteca', 'key',           '#0A84FF', 'expense', true, 1),
    (null, g_home, 'Luz',                 'zap',           '#0A84FF', 'expense', true, 2),
    (null, g_home, 'Agua',                'droplets',      '#0A84FF', 'expense', true, 3),
    (null, g_home, 'Gas',                 'flame',         '#0A84FF', 'expense', true, 4),
    (null, g_home, 'Internet y móvil',    'wifi',          '#0A84FF', 'expense', true, 5),
    (null, g_home, 'Comunidad',           'building',      '#0A84FF', 'expense', true, 6),
    (null, g_home, 'Mantenimiento',       'wrench',        '#0A84FF', 'expense', true, 7),

    (null, g_food, 'Supermercado',        'shopping-cart', '#FF9F0A', 'expense', true, 1),
    (null, g_food, 'Restaurantes',        'utensils',      '#FF9F0A', 'expense', true, 2),
    (null, g_food, 'Café y bares',        'coffee',        '#FF9F0A', 'expense', true, 3),
    (null, g_food, 'Comida a domicilio',  'bike',          '#FF9F0A', 'expense', true, 4),

    (null, g_transport, 'Combustible',    'fuel',          '#5E5CE6', 'expense', true, 1),
    (null, g_transport, 'Transporte público','train-front','#5E5CE6', 'expense', true, 2),
    (null, g_transport, 'Taxi y VTC',     'car-taxi-front','#5E5CE6', 'expense', true, 3),
    (null, g_transport, 'Parking y peajes','circle-parking','#5E5CE6','expense', true, 4),
    (null, g_transport, 'Coche',          'car',           '#5E5CE6', 'expense', true, 5),

    (null, g_life, 'Ropa',                'shirt',         '#FF375F', 'expense', true, 1),
    (null, g_life, 'Cuidado personal',    'scissors',      '#FF375F', 'expense', true, 2),
    (null, g_life, 'Regalos',             'gift',          '#FF375F', 'expense', true, 3),
    (null, g_life, 'Mascotas',            'paw-print',     '#FF375F', 'expense', true, 4),
    (null, g_life, 'Otros',               'package',       '#FF375F', 'expense', true, 5),

    (null, g_leisure, 'Suscripciones',    'tv',            '#BF5AF2', 'expense', true, 1),
    (null, g_leisure, 'Viajes',           'plane',         '#BF5AF2', 'expense', true, 2),
    (null, g_leisure, 'Cultura',          'ticket',        '#BF5AF2', 'expense', true, 3),
    (null, g_leisure, 'Deporte',          'dumbbell',      '#BF5AF2', 'expense', true, 4),
    (null, g_leisure, 'Hobbies',          'palette',       '#BF5AF2', 'expense', true, 5),

    (null, g_health, 'Farmacia',          'pill',          '#30D158', 'expense', true, 1),
    (null, g_health, 'Médico',            'stethoscope',   '#30D158', 'expense', true, 2),
    (null, g_health, 'Seguro de salud',   'shield-plus',   '#30D158', 'expense', true, 3),

    (null, g_finance, 'Comisiones',       'receipt',       '#64D2FF', 'expense', true, 1),
    (null, g_finance, 'Impuestos',        'scale',         '#64D2FF', 'expense', true, 2),
    (null, g_finance, 'Seguros',          'shield',        '#64D2FF', 'expense', true, 3),
    (null, g_finance, 'Intereses',        'percent',       '#64D2FF', 'expense', true, 4),

    (null, g_income, 'Nómina',            'briefcase',     '#30D158', 'income',  true, 1),
    (null, g_income, 'Autónomo',          'file-text',     '#30D158', 'income',  true, 2),
    (null, g_income, 'Inversiones',       'trending-up',   '#30D158', 'income',  true, 3),
    (null, g_income, 'Alquileres',        'house',         '#30D158', 'income',  true, 4),
    (null, g_income, 'Reembolsos',        'undo-2',        '#30D158', 'income',  true, 5),
    (null, g_income, 'Otros ingresos',    'plus-circle',   '#30D158', 'income',  true, 6);

  -- Traspasos: no cuentan como gasto ni como ingreso
  insert into public.categories (household_id, parent_id, name, icon, color, kind, is_system, position)
  values (null, null, 'Traspaso entre cuentas', 'arrow-left-right', '#8E8E93', 'transfer', true, 99);
end $$;
