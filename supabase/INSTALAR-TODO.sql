-- ============================================================
-- 0000 — RESET
--
-- ⚠️  DESTRUCTIVO: borra las tablas de la app anterior ("Hogar") y
--     también las de Aurora si quedaron de un intento anterior, para
--     que este script se pueda ejecutar tantas veces como haga falta.
--
--     Las CUENTAS DE USUARIO (auth.users) NO se tocan: se reutilizan,
--     así que no hay que volver a registrarse.
-- ============================================================

-- ---------- App anterior ----------
drop table if exists public.habit_checks cascade;
drop table if exists public.balance_snapshots cascade;
drop table if exists public.budgets cascade;

-- ---------- Aurora (por si hubo un intento previo a medias) ----------
drop table if exists public.dashboard_widgets cascade;
drop table if exists public.audit_log cascade;
drop table if exists public.attachments cascade;
drop table if exists public.reminders cascade;
drop table if exists public.notifications cascade;

drop table if exists public.task_comments cascade;
drop table if exists public.tasks cascade;
drop table if exists public.projects cascade;
drop table if exists public.areas cascade;

drop table if exists public.habit_rest_days cascade;
drop table if exists public.habit_entries cascade;
drop table if exists public.habits cascade;

drop table if exists public.investment_transactions cascade;
drop table if exists public.holdings cascade;
drop table if exists public.securities cascade;

drop table if exists public.exchange_rates cascade;
drop table if exists public.settlements cascade;
drop table if exists public.shared_expense_splits cascade;
drop table if exists public.shared_expenses cascade;
drop table if exists public.net_worth_snapshots cascade;
drop table if exists public.asset_valuations cascade;
drop table if exists public.assets cascade;
drop table if exists public.debts cascade;
drop table if exists public.goals cascade;
drop table if exists public.recurring_transactions cascade;
drop table if exists public.budget_lines cascade;
drop table if exists public.budget_periods cascade;
drop table if exists public.budgets cascade;

drop table if exists public.rules cascade;
drop table if exists public.transactions cascade;
drop table if exists public.categories cascade;
drop table if exists public.merchants cascade;
drop table if exists public.accounts cascade;
drop table if exists public.connections cascade;
drop table if exists public.institutions cascade;

drop table if exists public.user_settings cascade;
drop table if exists public.invitations cascade;
drop table if exists public.household_members cascade;
drop table if exists public.households cascade;
drop table if exists public.profiles cascade;

-- ---------- Funciones ----------
drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_new_household() cascade;
drop function if exists public.join_household_with_code(text) cascade;
drop function if exists public.accept_invitation(text) cascade;
drop function if exists public.snapshot_balance() cascade;

drop schema if exists private cascade;
-- ============================================================
-- 0001 — Extensiones y esquema privado
--
-- Aquí solo va lo que NO depende de ninguna tabla. Los helpers de
-- permisos consultan household_members, así que se definen en 0002,
-- justo después de crearla: PostgreSQL valida el cuerpo de las
-- funciones SQL en el momento de crearlas, no al ejecutarlas.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

/** Mantiene updated_at al día sin que la app tenga que acordarse. */
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
-- ============================================================
-- 0002 — Identidad: perfiles, hogares, miembros, invitaciones, ajustes
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  base_currency text not null default 'EUR' check (base_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Europe/Madrid',
  locale text not null default 'es' check (locale in ('es', 'en')),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  base_currency text not null default 'EUR' check (base_currency ~ '^[A-Z]{3}$'),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'adult' check (role in ('owner', 'adult', 'viewer', 'child')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index idx_members_user on public.household_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null unique default upper(encode(extensions.gen_random_bytes(4), 'hex')),
  role text not null default 'adult' check (role in ('owner', 'adult', 'viewer', 'child')),
  email text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_invitations_code on public.invitations (code) where accepted_at is null;

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme text not null default 'auto' check (theme in ('light', 'dark', 'auto')),
  accent text not null default 'indigo',
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  font_scale numeric(3, 2) not null default 1.0 check (font_scale between 0.8 and 1.5),
  enabled_modules text[] not null default array['finances', 'habits', 'tasks'],
  week_starts_on smallint not null default 1 check (week_starts_on in (1, 7)),
  date_format text not null default 'dd/MM/yyyy',
  fiscal_month_start smallint not null default 1 check (fiscal_month_start between 1 and 28),
  hide_amounts boolean not null default false,
  app_lock_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------- Helpers de permisos ----------
-- Van aquí, no en 0001, porque consultan household_members y PostgreSQL
-- valida el cuerpo de las funciones SQL al crearlas.
-- Son SECURITY DEFINER para romper la recursión de RLS: una política sobre
-- household_members no puede consultar household_members a través de RLS.

/** ¿El usuario actual pertenece al hogar? */
create or replace function private.is_member(h uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = h and user_id = auth.uid()
  );
$$;

/** Rol del usuario actual en el hogar (null si no pertenece). */
create or replace function private.role_in(h uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.household_members
  where household_id = h and user_id = auth.uid();
$$;

/** ¿Puede escribir datos financieros? Los roles viewer y child, no. */
create or replace function private.can_write_finances(h uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.role_in(h) in ('owner', 'adult');
$$;

/** ¿Puede ver datos financieros? El rol child nunca ve finanzas. */
create or replace function private.can_read_finances(h uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.role_in(h) in ('owner', 'adult', 'viewer');
$$;

/** ¿Es owner del hogar? (gestión de miembros y ajustes del hogar) */
create or replace function private.is_owner(h uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.role_in(h) = 'owner';
$$;

/** ¿Comparten hogar el usuario actual y otro usuario? Para ver perfiles. */
create or replace function private.shares_household(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.household_members a
    join public.household_members b using (household_id)
    where a.user_id = auth.uid() and b.user_id = u
  );
$$;

create trigger touch_profiles before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger touch_households before update on public.households
  for each row execute function private.touch_updated_at();
create trigger touch_user_settings before update on public.user_settings
  for each row execute function private.touch_updated_at();

-- ---------- Alta de usuario: perfil + ajustes por defecto ----------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
             nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
             split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Alta de hogar: el creador entra como owner ----------

create or replace function public.handle_new_household()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_household_created
  after insert on public.households
  for each row execute function public.handle_new_household();

-- ---------- Unirse con código ----------

create or replace function public.accept_invitation(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations
  where code = upper(trim(p_code)) and accepted_at is null and expires_at > now();

  if v_inv.id is null then
    raise exception 'invitation_invalid' using hint = 'Código no válido o caducado';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_inv.household_id, auth.uid(), v_inv.role)
  on conflict (household_id, user_id) do nothing;

  update public.invitations
  set accepted_by = auth.uid(), accepted_at = now()
  where id = v_inv.id;

  return v_inv.household_id;
end;
$$;

-- ---------- RLS ----------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invitations enable row level security;
alter table public.user_settings enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or private.shares_household(id));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- OJO: el `or created_by = auth.uid()` es imprescindible. El RETURNING del
-- INSERT se evalúa ANTES de que el trigger inserte la membresía, así que sin
-- él un `insert(...).select()` falla con "new row violates RLS" (error
-- engañoso: la que falla es la política de SELECT, no la de INSERT).
create policy households_select on public.households
  for select to authenticated
  using (private.is_member(id) or created_by = auth.uid());
create policy households_insert on public.households
  for insert to authenticated
  with check (created_by = auth.uid());
create policy households_update on public.households
  for update to authenticated
  using (private.is_owner(id)) with check (private.is_owner(id));
create policy households_delete on public.households
  for delete to authenticated
  using (private.is_owner(id));

create policy members_select on public.household_members
  for select to authenticated
  using (user_id = auth.uid() or private.is_member(household_id));
create policy members_manage on public.household_members
  for all to authenticated
  using (private.is_owner(household_id)) with check (private.is_owner(household_id));
create policy members_leave on public.household_members
  for delete to authenticated
  using (user_id = auth.uid());

create policy invitations_manage on public.invitations
  for all to authenticated
  using (private.is_owner(household_id)) with check (private.is_owner(household_id));

create policy settings_own on public.user_settings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- ============================================================
-- 0003 — Núcleo financiero: entidades, cuentas, comercios,
--        categorías, movimientos y motor de reglas.
--
-- Importes SIEMPRE en unidades mínimas (bigint). Negativo = salida de dinero.
-- ============================================================

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'ES' check (country ~ '^[A-Z]{2}$'),
  bic text,
  logo_url text,
  provider text check (provider in ('gocardless', 'tink', 'truelayer', 'plaid', 'manual')),
  provider_institution_id text,
  transaction_history_days int not null default 90,
  created_at timestamptz not null default now(),
  unique (provider, provider_institution_id)
);

-- Catálogo público de bancos: lo lee cualquiera autenticado, nadie lo escribe
-- desde el cliente (lo puebla una Edge Function).
alter table public.institutions enable row level security;
create policy institutions_read on public.institutions
  for select to authenticated using (true);

-- ---------- Conexión con el agregador PSD2 ----------

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  institution_id uuid not null references public.institutions (id),
  provider text not null default 'gocardless',
  /** Identificador del acuerdo en el proveedor (requisition_id en GoCardless). */
  provider_ref text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'revoked', 'error')),
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);

create index idx_connections_household on public.connections (household_id);
create index idx_connections_expiring on public.connections (consent_expires_at)
  where status = 'active';

-- ---------- Cuentas ----------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  connection_id uuid references public.connections (id) on delete set null,
  institution_id uuid references public.institutions (id),
  name text not null check (length(trim(name)) > 0),
  type text not null default 'checking' check (type in (
    'checking', 'savings', 'credit_card', 'debit_card', 'cash',
    'investment', 'loan', 'mortgage', 'property', 'crypto', 'other'
  )),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  current_balance bigint not null default 0,
  available_balance bigint,
  /** Solo los 4 últimos dígitos: el IBAN completo nunca llega al cliente. */
  iban_last4 text check (iban_last4 ~ '^[0-9A-Z]{4}$'),
  provider_account_id text,
  include_in_net_worth boolean not null default true,
  /** null = cuenta del hogar; con valor = cuenta personal de ese miembro. */
  owner_id uuid references public.profiles (id) on delete set null,
  is_manual boolean not null default true,
  archived boolean not null default false,
  position int not null default 0,
  /** Ciclo de facturación de tarjetas de crédito (día del mes). */
  statement_day smallint check (statement_day between 1 and 28),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_account_id)
);

create index idx_accounts_household on public.accounts (household_id, position)
  where archived = false;

/** Hogar al que pertenece una cuenta, para políticas en cascada. */
create or replace function private.account_household(acc uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select household_id from public.accounts where id = acc;
$$;

-- ---------- Comercios normalizados ----------

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  /** null = comercio global compartido; con valor = creado por ese hogar. */
  household_id uuid references public.households (id) on delete cascade,
  name text not null,
  normalized_name text not null,
  logo_url text,
  default_category_id uuid,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_merchants_normalized on public.merchants (normalized_name);
create index idx_merchants_aliases on public.merchants using gin (aliases);

-- ---------- Categorías (jerárquicas: grupo → categoría) ----------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  /** null = categoría del sistema, visible para todos los hogares. */
  household_id uuid references public.households (id) on delete cascade,
  parent_id uuid references public.categories (id) on delete cascade,
  name text not null,
  icon text not null default 'circle',
  color text not null default '#8E8E93',
  kind text not null default 'expense' check (kind in ('expense', 'income', 'transfer')),
  is_system boolean not null default false,
  archived boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_categories_household on public.categories (household_id, position);
create index idx_categories_parent on public.categories (parent_id);

alter table public.merchants
  add constraint merchants_default_category_fk
  foreign key (default_category_id) references public.categories (id) on delete set null;

-- ---------- Movimientos ----------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  booked_at date not null default current_date,
  value_date date,
  /** Unidades mínimas en la divisa de la cuenta. Negativo = gasto. */
  amount bigint not null,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  /** El mismo importe en la divisa base del hogar, para poder sumar. */
  amount_base bigint not null,
  raw_description text not null default '',
  clean_description text,
  merchant_id uuid references public.merchants (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  notes text,
  tags text[] not null default '{}',
  is_transfer boolean not null default false,
  transfer_pair_id uuid references public.transactions (id) on delete set null,
  split_parent_id uuid references public.transactions (id) on delete cascade,
  recurring_id uuid,
  status text not null default 'booked' check (status in ('pending', 'booked')),
  source text not null default 'manual' check (source in ('bank', 'manual', 'imported')),
  reviewed boolean not null default false,
  excluded_from_budget boolean not null default false,
  /** Hash estable (cuenta, fecha, importe, referencia) para no duplicar en cada sync. */
  dedup_hash text,
  provider_transaction_id text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotencia de la sincronización: el mismo movimiento no puede entrar dos veces.
create unique index idx_transactions_dedup
  on public.transactions (account_id, dedup_hash)
  where dedup_hash is not null;

create index idx_transactions_account_date
  on public.transactions (account_id, booked_at desc);
create index idx_transactions_household_date
  on public.transactions (household_id, booked_at desc);
create index idx_transactions_category
  on public.transactions (household_id, category_id, booked_at desc);
create index idx_transactions_unreviewed
  on public.transactions (household_id, booked_at desc)
  where reviewed = false and split_parent_id is null;
create index idx_transactions_search
  on public.transactions using gin (
    (coalesce(clean_description, '') || ' ' || raw_description) extensions.gin_trgm_ops
  );
create index idx_transactions_tags on public.transactions using gin (tags);

-- ---------- Motor de reglas ----------

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  /** [{field, op, value}] — field: description|amount|account|merchant */
  conditions jsonb not null default '[]'::jsonb,
  /** {set_category_id, set_merchant_id, rename_to, add_tags, mark_transfer, exclude_from_budget} */
  actions jsonb not null default '{}'::jsonb,
  match_all boolean not null default true,
  priority int not null default 100,
  enabled boolean not null default true,
  /** Estadística para poder ordenarlas por utilidad real. */
  times_applied int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_rules_household on public.rules (household_id, priority)
  where enabled = true;

create trigger touch_accounts before update on public.accounts
  for each row execute function private.touch_updated_at();
create trigger touch_transactions before update on public.transactions
  for each row execute function private.touch_updated_at();
create trigger touch_connections before update on public.connections
  for each row execute function private.touch_updated_at();
create trigger touch_rules before update on public.rules
  for each row execute function private.touch_updated_at();

-- ---------- RLS ----------
-- Lectura: owner/adult/viewer. Escritura: owner/adult. `child` no ve nada.

alter table public.connections enable row level security;
alter table public.accounts enable row level security;
alter table public.merchants enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.rules enable row level security;

create policy connections_read on public.connections
  for select to authenticated using (private.can_read_finances(household_id));
create policy connections_write on public.connections
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));

create policy accounts_read on public.accounts
  for select to authenticated using (private.can_read_finances(household_id));
create policy accounts_write on public.accounts
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));

create policy merchants_read on public.merchants
  for select to authenticated
  using (household_id is null or private.can_read_finances(household_id));
create policy merchants_write on public.merchants
  for all to authenticated
  using (household_id is not null and private.can_write_finances(household_id))
  with check (household_id is not null and private.can_write_finances(household_id));

create policy categories_read on public.categories
  for select to authenticated
  using (household_id is null or private.can_read_finances(household_id));
create policy categories_write on public.categories
  for all to authenticated
  using (household_id is not null and private.can_write_finances(household_id))
  with check (household_id is not null and private.can_write_finances(household_id));

create policy transactions_read on public.transactions
  for select to authenticated using (private.can_read_finances(household_id));
create policy transactions_write on public.transactions
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));

create policy rules_read on public.rules
  for select to authenticated using (private.can_read_finances(household_id));
create policy rules_write on public.rules
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));
-- ============================================================
-- 0004 — Planificación: presupuestos, recurrentes, objetivos,
--        deudas, activos, patrimonio y gastos compartidos.
-- ============================================================

-- ---------- Presupuestos ----------

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null default 'Presupuesto mensual',
  model text not null default 'traditional'
    check (model in ('traditional', 'envelope', 'fifty_thirty_twenty')),
  /** Día en que empieza el periodo (útil si cobras el 25). */
  period_start_day smallint not null default 1 check (period_start_day between 1 and 28),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.budget_periods (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  unique (budget_id, starts_on),
  check (ends_on > starts_on)
);

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.budget_periods (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  planned_amount bigint not null check (planned_amount >= 0),
  /** Sobrante que viene arrastrado del periodo anterior (modelo sobres). */
  rollover_amount bigint not null default 0,
  rollover_enabled boolean not null default false,
  unique (period_id, category_id)
);

create index idx_budget_periods_budget on public.budget_periods (budget_id, starts_on desc);

-- ---------- Recurrentes y suscripciones ----------

create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  merchant_id uuid references public.merchants (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  /** Importe medio observado; el real puede variar ±10%. */
  average_amount bigint not null,
  currency text not null default 'EUR',
  cadence text not null default 'monthly'
    check (cadence in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  next_expected_on date,
  last_seen_on date,
  status text not null default 'active' check (status in ('active', 'cancelled', 'paused')),
  /** true si lo detectó el sistema; false si lo creó el usuario a mano. */
  auto_detected boolean not null default false,
  price_change_detected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_recurring_household on public.recurring_transactions (household_id, next_expected_on)
  where status = 'active';

alter table public.transactions
  add constraint transactions_recurring_fk
  foreign key (recurring_id) references public.recurring_transactions (id) on delete set null;

-- ---------- Objetivos de ahorro ----------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  icon text not null default 'target',
  color text not null default '#5E5CE6',
  target_amount bigint not null check (target_amount > 0),
  current_amount bigint not null default 0,
  currency text not null default 'EUR',
  target_date date,
  /** Cuentas cuyo saldo cuenta para este objetivo. */
  linked_account_ids uuid[] not null default '{}',
  monthly_contribution bigint,
  achieved_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Deudas ----------

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  name text not null,
  kind text not null default 'loan' check (kind in ('loan', 'mortgage', 'credit_card', 'personal')),
  principal bigint not null check (principal > 0),
  current_balance bigint not null,
  currency text not null default 'EUR',
  /** Tipo de interés nominal anual en puntos básicos (3,25 % = 325). */
  interest_rate_bps int not null default 0 check (interest_rate_bps >= 0),
  apr_bps int,
  monthly_payment bigint,
  payment_day smallint check (payment_day between 1 and 28),
  started_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Activos no bancarios (inmuebles, vehículos) ----------

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  name text not null,
  kind text not null default 'property'
    check (kind in ('property', 'vehicle', 'collectible', 'other')),
  current_value bigint not null default 0,
  currency text not null default 'EUR',
  acquired_on date,
  acquisition_value bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  valued_on date not null default current_date,
  value bigint not null,
  source text not null default 'manual',
  unique (asset_id, valued_on)
);

-- ---------- Foto diaria del patrimonio ----------

create table public.net_worth_snapshots (
  household_id uuid not null references public.households (id) on delete cascade,
  captured_on date not null default current_date,
  assets_total bigint not null default 0,
  liabilities_total bigint not null default 0,
  net_worth bigint not null default 0,
  currency text not null default 'EUR',
  /** Desglose por tipo de cuenta, para la gráfica de composición. */
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (household_id, captured_on)
);

create index idx_snapshots_date on public.net_worth_snapshots (household_id, captured_on desc);

-- ---------- Gastos compartidos (estilo Splitwise, dentro del hogar) ----------

create table public.shared_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete cascade,
  description text not null,
  total_amount bigint not null check (total_amount > 0),
  currency text not null default 'EUR',
  paid_by uuid not null references public.profiles (id),
  split_method text not null default 'equal'
    check (split_method in ('equal', 'percentage', 'exact', 'shares')),
  occurred_on date not null default current_date,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.shared_expense_splits (
  id uuid primary key default gen_random_uuid(),
  shared_expense_id uuid not null references public.shared_expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  /** Parte que le corresponde. La suma de todas = total_amount, sin perder céntimos. */
  amount bigint not null,
  weight numeric(10, 4),
  unique (shared_expense_id, user_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_user uuid not null references public.profiles (id),
  to_user uuid not null references public.profiles (id),
  amount bigint not null check (amount > 0),
  currency text not null default 'EUR',
  settled_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

-- ---------- Tipos de cambio ----------

create table public.exchange_rates (
  base text not null check (base ~ '^[A-Z]{3}$'),
  quote text not null check (quote ~ '^[A-Z]{3}$'),
  rate_date date not null,
  /** Tasa con 8 decimales para no perder precisión al convertir. */
  rate numeric(20, 8) not null check (rate > 0),
  primary key (base, quote, rate_date)
);

alter table public.exchange_rates enable row level security;
create policy rates_read on public.exchange_rates
  for select to authenticated using (true);

create trigger touch_recurring before update on public.recurring_transactions
  for each row execute function private.touch_updated_at();
create trigger touch_goals before update on public.goals
  for each row execute function private.touch_updated_at();
create trigger touch_debts before update on public.debts
  for each row execute function private.touch_updated_at();
create trigger touch_assets before update on public.assets
  for each row execute function private.touch_updated_at();

-- ---------- RLS ----------

alter table public.budgets enable row level security;
alter table public.budget_periods enable row level security;
alter table public.budget_lines enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.goals enable row level security;
alter table public.debts enable row level security;
alter table public.assets enable row level security;
alter table public.asset_valuations enable row level security;
alter table public.net_worth_snapshots enable row level security;
alter table public.shared_expenses enable row level security;
alter table public.shared_expense_splits enable row level security;
alter table public.settlements enable row level security;

create policy budgets_read on public.budgets
  for select to authenticated using (private.can_read_finances(household_id));
create policy budgets_write on public.budgets
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));

-- En cascada por su presupuesto padre
create policy budget_periods_all on public.budget_periods
  for all to authenticated
  using (exists (
    select 1 from public.budgets b
    where b.id = budget_id and private.can_read_finances(b.household_id)
  ))
  with check (exists (
    select 1 from public.budgets b
    where b.id = budget_id and private.can_write_finances(b.household_id)
  ));

create policy budget_lines_all on public.budget_lines
  for all to authenticated
  using (exists (
    select 1 from public.budget_periods p
    join public.budgets b on b.id = p.budget_id
    where p.id = period_id and private.can_read_finances(b.household_id)
  ))
  with check (exists (
    select 1 from public.budget_periods p
    join public.budgets b on b.id = p.budget_id
    where p.id = period_id and private.can_write_finances(b.household_id)
  ));

create policy recurring_read on public.recurring_transactions
  for select to authenticated using (private.can_read_finances(household_id));
create policy recurring_write on public.recurring_transactions
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));

create policy goals_read on public.goals
  for select to authenticated using (private.can_read_finances(household_id));
create policy goals_write on public.goals
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));

create policy debts_read on public.debts
  for select to authenticated using (private.can_read_finances(household_id));
create policy debts_write on public.debts
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));

create policy assets_read on public.assets
  for select to authenticated using (private.can_read_finances(household_id));
create policy assets_write on public.assets
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));

create policy asset_valuations_all on public.asset_valuations
  for all to authenticated
  using (exists (
    select 1 from public.assets a
    where a.id = asset_id and private.can_read_finances(a.household_id)
  ))
  with check (exists (
    select 1 from public.assets a
    where a.id = asset_id and private.can_write_finances(a.household_id)
  ));

create policy snapshots_read on public.net_worth_snapshots
  for select to authenticated using (private.can_read_finances(household_id));
create policy snapshots_write on public.net_worth_snapshots
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));

create policy shared_read on public.shared_expenses
  for select to authenticated using (private.is_member(household_id));
create policy shared_write on public.shared_expenses
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));

create policy splits_all on public.shared_expense_splits
  for all to authenticated
  using (exists (
    select 1 from public.shared_expenses e
    where e.id = shared_expense_id and private.is_member(e.household_id)
  ))
  with check (exists (
    select 1 from public.shared_expenses e
    where e.id = shared_expense_id and private.can_write_finances(e.household_id)
  ));

create policy settlements_read on public.settlements
  for select to authenticated using (private.is_member(household_id));
create policy settlements_write on public.settlements
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));
-- ============================================================
-- 0005 — Inversiones: valores, posiciones y operaciones.
--
-- PSD2 no cubre carteras de valores, así que estos datos entran por
-- importación CSV del bróker o a mano. Ver docs/banking.md.
-- ============================================================

create table public.securities (
  id uuid primary key default gen_random_uuid(),
  isin text unique check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  ticker text,
  name text not null,
  kind text not null default 'stock'
    check (kind in ('stock', 'etf', 'fund', 'bond', 'crypto', 'other')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  exchange text,
  /** Último precio conocido, en unidades mínimas de `currency`. */
  last_price bigint,
  last_price_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_securities_ticker on public.securities (ticker);

alter table public.securities enable row level security;
create policy securities_read on public.securities
  for select to authenticated using (true);
-- Escritura solo desde Edge Functions (service role); el cliente no inserta valores.

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  security_id uuid not null references public.securities (id),
  /** Participaciones con 8 decimales (fracciones de acción, cripto). */
  quantity numeric(24, 8) not null default 0,
  /** Precio medio de compra en unidades mínimas. */
  average_cost bigint not null default 0,
  currency text not null default 'EUR',
  updated_at timestamptz not null default now(),
  unique (account_id, security_id)
);

create index idx_holdings_household on public.holdings (household_id);

create table public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  security_id uuid references public.securities (id),
  kind text not null check (kind in ('buy', 'sell', 'dividend', 'fee', 'split', 'deposit', 'withdrawal')),
  executed_on date not null,
  quantity numeric(24, 8),
  price bigint,
  /** Importe total de la operación en unidades mínimas. Negativo = salida. */
  amount bigint not null,
  fees bigint not null default 0,
  taxes bigint not null default 0,
  currency text not null default 'EUR',
  notes text,
  /** Para no duplicar al reimportar el mismo CSV. */
  dedup_hash text,
  source text not null default 'manual' check (source in ('manual', 'imported', 'broker')),
  created_at timestamptz not null default now()
);

create unique index idx_investment_dedup
  on public.investment_transactions (account_id, dedup_hash)
  where dedup_hash is not null;

create index idx_investment_tx_account
  on public.investment_transactions (account_id, executed_on desc);

create trigger touch_holdings before update on public.holdings
  for each row execute function private.touch_updated_at();

alter table public.holdings enable row level security;
alter table public.investment_transactions enable row level security;

create policy holdings_read on public.holdings
  for select to authenticated using (private.can_read_finances(household_id));
create policy holdings_write on public.holdings
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));

create policy investment_tx_read on public.investment_transactions
  for select to authenticated using (private.can_read_finances(household_id));
create policy investment_tx_write on public.investment_transactions
  for all to authenticated
  using (private.can_write_finances(household_id))
  with check (private.can_write_finances(household_id));
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
-- ============================================================
-- 0007 — Tareas: áreas → proyectos → tareas → subtareas.
-- Recurrencia con RRULE (RFC 5545) para cubrir casos como
-- "cada último día laborable del mes".
-- ============================================================

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  icon text not null default 'folder',
  color text not null default '#0A84FF',
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  area_id uuid references public.areas (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  notes text,
  icon text not null default 'list',
  color text,
  due_date date,
  completed_at timestamptz,
  archived boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_area on public.projects (area_id, position);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  parent_task_id uuid references public.tasks (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text,
  /** Fecha límite real (vence). */
  due_date date,
  /** Fecha en la que planeo hacerla (patrón Things: "Hoy" ≠ "vence hoy"). */
  planned_date date,
  due_time time,
  priority text not null default 'none' check (priority in ('none', 'low', 'medium', 'high')),
  tags text[] not null default '{}',
  /** RRULE RFC 5545, ej: FREQ=MONTHLY;BYDAY=-1MO */
  rrule text,
  /** Si es una repetición, apunta a la tarea plantilla original. */
  recurrence_parent_id uuid references public.tasks (id) on delete set null,
  checklist jsonb not null default '[]'::jsonb,
  assigned_to uuid references public.profiles (id) on delete set null,
  /** Enlace opcional con un gasto previsto ("renovar seguro" ↔ recurrente). */
  recurring_transaction_id uuid references public.recurring_transactions (id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  position int not null default 0,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vistas fijas del patrón Things: Bandeja / Hoy / Próximos
create index idx_tasks_inbox on public.tasks (household_id, created_at desc)
  where completed_at is null and project_id is null and planned_date is null;
create index idx_tasks_planned on public.tasks (household_id, planned_date)
  where completed_at is null;
create index idx_tasks_due on public.tasks (household_id, due_date)
  where completed_at is null;
create index idx_tasks_project on public.tasks (project_id, position)
  where completed_at is null;
create index idx_tasks_assignee on public.tasks (assigned_to)
  where completed_at is null;
create index idx_tasks_tags on public.tasks using gin (tags);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index idx_task_comments_task on public.task_comments (task_id, created_at);

create trigger touch_projects before update on public.projects
  for each row execute function private.touch_updated_at();
create trigger touch_tasks before update on public.tasks
  for each row execute function private.touch_updated_at();

-- ---------- RLS ----------
-- Las tareas las ve todo el hogar, incluido `child` (es su módulo).

alter table public.areas enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;

create policy areas_all on public.areas
  for all to authenticated
  using (private.is_member(household_id)) with check (private.is_member(household_id));

create policy projects_all on public.projects
  for all to authenticated
  using (private.is_member(household_id)) with check (private.is_member(household_id));

create policy tasks_read on public.tasks
  for select to authenticated using (private.is_member(household_id));
create policy tasks_write on public.tasks
  for all to authenticated
  using (private.role_in(household_id) in ('owner', 'adult', 'child'))
  with check (private.role_in(household_id) in ('owner', 'adult', 'child'));

create policy task_comments_all on public.task_comments
  for all to authenticated
  using (exists (
    select 1 from public.tasks t where t.id = task_id and private.is_member(t.household_id)
  ))
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id and private.is_member(t.household_id))
  );
-- ============================================================
-- 0008 — Transversal: notificaciones, adjuntos, auditoría y dashboard.
-- ============================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  kind text not null check (kind in (
    'budget_threshold', 'consent_expiring', 'sync_error', 'task_due',
    'habit_reminder', 'recurring_upcoming', 'price_change', 'goal_reached',
    'low_balance', 'task_assigned'
  )),
  title text not null,
  body text,
  /** Ruta interna a la que lleva el aviso, ej. /finanzas/movimientos?id=… */
  action_path text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_unread on public.notifications (user_id, created_at desc)
  where read_at is null;

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  habit_id uuid references public.habits (id) on delete cascade,
  remind_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (task_id is not null or habit_id is not null)
);

create index idx_reminders_pending on public.reminders (remind_at) where sent_at is null;

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  /** Ruta dentro del bucket de Supabase Storage. */
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0),
  uploaded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index idx_attachments_transaction on public.attachments (transaction_id);
create index idx_attachments_task on public.attachments (task_id);

create table public.audit_log (
  id bigserial primary key,
  household_id uuid references public.households (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_household on public.audit_log (household_id, created_at desc);

create table public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in (
    'net_worth', 'month_spending', 'cash_flow', 'upcoming_recurring',
    'today_tasks', 'today_habits', 'goals', 'unreviewed', 'accounts_balance'
  )),
  position int not null default 0,
  size text not null default 'medium' check (size in ('small', 'medium', 'large')),
  config jsonb not null default '{}'::jsonb,
  visible boolean not null default true,
  unique (user_id, household_id, kind)
);

-- ---------- RLS ----------

alter table public.notifications enable row level security;
alter table public.reminders enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_log enable row level security;
alter table public.dashboard_widgets enable row level security;

create policy notifications_own on public.notifications
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reminders_own on public.reminders
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy attachments_all on public.attachments
  for all to authenticated
  using (private.is_member(household_id)) with check (private.is_member(household_id));

-- El log solo se lee (lo escriben triggers y Edge Functions con service role)
create policy audit_read on public.audit_log
  for select to authenticated using (private.is_owner(household_id));

create policy widgets_own on public.dashboard_widgets
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
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
