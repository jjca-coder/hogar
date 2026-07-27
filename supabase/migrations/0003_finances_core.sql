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
