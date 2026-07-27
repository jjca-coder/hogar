-- ============================================================
-- 0006 — Hábitos: definición, registros y días de descanso.
--
-- Las rachas NO se guardan: se calculan en el cliente a partir de
-- habit_entries (ver docs/decisions.md D-007). Menos estado que
-- mantener sincronizado y el volumen de datos es pequeño.
-- ============================================================

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  icon text not null default 'sparkles',
  color text not null default '#30D158',
  /** `avoid` cuenta días SIN hacerlo (dejar de fumar). */
  kind text not null default 'do' check (kind in ('do', 'avoid')),
  unit text not null default 'times'
    check (unit in ('times', 'minutes', 'pages', 'grams', 'litres', 'currency')),
  /** Objetivo por periodo: 1 vez, 30 minutos, 2 litros… */
  target_per_period numeric(10, 2) not null default 1 check (target_per_period > 0),
  frequency text not null default 'daily'
    check (frequency in ('daily', 'weekdays', 'times_per_week', 'every_n_days')),
  /** ISO: 1 = lunes … 7 = domingo. Solo aplica a `weekdays`. */
  weekdays smallint[] not null default '{1,2,3,4,5,6,7}',
  /** Solo aplica a `times_per_week` (N veces) y `every_n_days` (cada N días). */
  target_count smallint not null default 1 check (target_count between 1 and 31),
  interval_days smallint not null default 1 check (interval_days between 1 and 365),
  reminder_at time,
  /** Visible para el resto del hogar (para animarse). Nunca obligatorio. */
  is_shared boolean not null default false,
  archived boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_habits_owner on public.habits (owner_id, position) where archived = false;
create index idx_habits_household on public.habits (household_id) where is_shared = true;

create table public.habit_entries (
  habit_id uuid not null references public.habits (id) on delete cascade,
  entry_date date not null default current_date,
  /** Cantidad registrada. Para hábitos de tipo "veces" suele ser 1. */
  value numeric(10, 2) not null default 1 check (value >= 0),
  note text,
  created_at timestamptz not null default now(),
  primary key (habit_id, entry_date)
);

create index idx_habit_entries_date on public.habit_entries (entry_date desc);

/** Días planificados de descanso: no cuentan como fallo ni rompen la racha. */
create table public.habit_rest_days (
  habit_id uuid not null references public.habits (id) on delete cascade,
  rest_date date not null,
  reason text,
  primary key (habit_id, rest_date)
);

create trigger touch_habits before update on public.habits
  for each row execute function private.touch_updated_at();

-- ---------- RLS ----------
-- Se ve un hábito si es tuyo, o si su dueño lo ha marcado como compartido
-- y estáis en el mismo hogar. Escribir, solo el dueño.

create or replace function private.habit_readable(hab uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.habits h
    where h.id = hab
      and (h.owner_id = auth.uid()
           or (h.is_shared and private.is_member(h.household_id)))
  );
$$;

create or replace function private.owns_habit(hab uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.habits h where h.id = hab and h.owner_id = auth.uid());
$$;

alter table public.habits enable row level security;
alter table public.habit_entries enable row level security;
alter table public.habit_rest_days enable row level security;

create policy habits_read on public.habits
  for select to authenticated
  using (owner_id = auth.uid() or (is_shared and private.is_member(household_id)));
create policy habits_insert on public.habits
  for insert to authenticated
  with check (owner_id = auth.uid() and private.is_member(household_id));
create policy habits_update on public.habits
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy habits_delete on public.habits
  for delete to authenticated using (owner_id = auth.uid());

create policy habit_entries_read on public.habit_entries
  for select to authenticated using (private.habit_readable(habit_id));
create policy habit_entries_write on public.habit_entries
  for all to authenticated
  using (private.owns_habit(habit_id)) with check (private.owns_habit(habit_id));

create policy habit_rest_read on public.habit_rest_days
  for select to authenticated using (private.habit_readable(habit_id));
create policy habit_rest_write on public.habit_rest_days
  for all to authenticated
  using (private.owns_habit(habit_id)) with check (private.owns_habit(habit_id));
