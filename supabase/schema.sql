-- ============================================================
-- HOGAR — esquema inicial
-- Pégalo entero en el SQL Editor de Supabase y ejecútalo.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated, anon;

-- ---------- Tablas ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  color text not null default '#0d9488',
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(encode(extensions.gen_random_bytes(3), 'hex')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  emoji text not null default '🏷️',
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  sort int not null default 0
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  description text not null default '',
  amount_cents int not null check (amount_cents > 0),
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  paid_by uuid not null references public.profiles (id),
  is_shared boolean not null default true,
  date date not null default current_date,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month date not null, -- primer día del mes
  amount_cents int not null check (amount_cents > 0),
  unique (household_id, category_id, month)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  notes text,
  assigned_to uuid references public.profiles (id) on delete set null,
  due_date date,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'biweekly', 'monthly')),
  done_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  emoji text not null default '💪',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.habit_checks (
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null default current_date,
  primary key (habit_id, date)
);

create index idx_transactions_household_date on public.transactions (household_id, date desc);
create index idx_tasks_household on public.tasks (household_id, done_at, due_date);
create index idx_categories_household on public.categories (household_id, sort);
create index idx_habits_household on public.habits (household_id);

-- ---------- Funciones auxiliares (evitan recursión en RLS) ----------

create or replace function private.is_member(h uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = h and user_id = auth.uid()
  );
$$;

create or replace function private.same_household(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.household_members a
    join public.household_members b using (household_id)
    where a.user_id = auth.uid() and b.user_id = u
  );
$$;

create or replace function private.habit_visible(hab uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.habits h
    join public.household_members m on m.household_id = h.household_id
    where h.id = hab and m.user_id = auth.uid()
  );
$$;

create or replace function private.owns_habit(hab uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.habits h where h.id = hab and h.owner = auth.uid()
  );
$$;

-- ---------- Triggers ----------

-- Al registrarse un usuario: crear su perfil
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    (array['#0d9488', '#e11d48', '#7c3aed', '#d97706'])[1 + floor(random() * 4)::int]
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Al crear un hogar: añadir al creador como miembro y sembrar categorías
create or replace function public.handle_new_household()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.household_members (household_id, user_id)
  values (new.id, new.created_by);

  insert into public.categories (household_id, name, emoji, kind, sort) values
    (new.id, 'Supermercado',  '🛒', 'expense', 1),
    (new.id, 'Restaurantes',  '🍽️', 'expense', 2),
    (new.id, 'Casa',          '🏠', 'expense', 3),
    (new.id, 'Suministros',   '💡', 'expense', 4),
    (new.id, 'Transporte',    '🚗', 'expense', 5),
    (new.id, 'Ocio',          '🎬', 'expense', 6),
    (new.id, 'Salud',         '⚕️', 'expense', 7),
    (new.id, 'Ropa',          '👕', 'expense', 8),
    (new.id, 'Suscripciones', '📺', 'expense', 9),
    (new.id, 'Viajes',        '✈️', 'expense', 10),
    (new.id, 'Regalos',       '🎁', 'expense', 11),
    (new.id, 'Otros',         '📦', 'expense', 12),
    (new.id, 'Nómina',        '💼', 'income', 1),
    (new.id, 'Otros ingresos','💶', 'income', 2);

  return new;
end;
$$;

create trigger on_household_created
  after insert on public.households
  for each row execute function public.handle_new_household();

-- ---------- RPC: unirse a un hogar con código ----------

create or replace function public.join_household_with_code(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
begin
  select id into v_household
  from public.households
  where invite_code = upper(trim(p_code));

  if v_household is null then
    raise exception 'not_found';
  end if;

  insert into public.household_members (household_id, user_id)
  values (v_household, auth.uid())
  on conflict do nothing;

  return v_household;
end;
$$;

-- ---------- RLS ----------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.tasks enable row level security;
alter table public.habits enable row level security;
alter table public.habit_checks enable row level security;

create policy "ver mi perfil y el de mi hogar" on public.profiles
  for select using (id = auth.uid() or private.same_household(id));
create policy "editar mi perfil" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "crear hogar" on public.households
  for insert with check (created_by = auth.uid());
create policy "ver mi hogar" on public.households
  for select using (private.is_member(id));
create policy "editar mi hogar" on public.households
  for update using (private.is_member(id));

create policy "ver miembros" on public.household_members
  for select using (user_id = auth.uid() or private.is_member(household_id));
create policy "salir del hogar" on public.household_members
  for delete using (user_id = auth.uid());

create policy "categorias del hogar" on public.categories
  for all using (private.is_member(household_id)) with check (private.is_member(household_id));

create policy "movimientos del hogar" on public.transactions
  for all using (private.is_member(household_id)) with check (private.is_member(household_id));

create policy "presupuestos del hogar" on public.budgets
  for all using (private.is_member(household_id)) with check (private.is_member(household_id));

create policy "tareas del hogar" on public.tasks
  for all using (private.is_member(household_id)) with check (private.is_member(household_id));

create policy "ver habitos del hogar" on public.habits
  for select using (private.is_member(household_id));
create policy "crear mis habitos" on public.habits
  for insert with check (private.is_member(household_id) and owner = auth.uid());
create policy "editar mis habitos" on public.habits
  for update using (owner = auth.uid());
create policy "borrar mis habitos" on public.habits
  for delete using (owner = auth.uid());

create policy "ver checks del hogar" on public.habit_checks
  for select using (private.habit_visible(habit_id));
create policy "marcar mis habitos" on public.habit_checks
  for insert with check (private.owns_habit(habit_id));
create policy "desmarcar mis habitos" on public.habit_checks
  for delete using (private.owns_habit(habit_id));

-- ---------- Realtime (para sincronización en vivo, fase 2 en la app) ----------

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.habits;
alter publication supabase_realtime add table public.habit_checks;
