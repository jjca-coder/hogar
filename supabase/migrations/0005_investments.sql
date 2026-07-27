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
