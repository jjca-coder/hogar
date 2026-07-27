-- ============================================================
-- HOGAR — migración 02: cuentas y patrimonio
-- Ejecutar en el SQL Editor DESPUÉS de schema.sql.
-- Añade cuentas (banco, efectivo, inversión, tarjetas, deudas),
-- histórico de saldos para la gráfica, y deja el hueco listo
-- para la sincronización bancaria automática (fase 3).
-- ============================================================

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  kind text not null default 'checking'
    check (kind in ('checking', 'savings', 'cash', 'investment', 'property', 'card', 'loan')),
  institution text,
  -- Negativo en tarjetas de crédito y préstamos. bigint por si algún día hay hipoteca.
  balance_cents bigint not null default 0,
  currency text not null default 'EUR',
  owner uuid references public.profiles (id) on delete set null, -- null = de los dos
  include_in_net_worth boolean not null default true,
  archived boolean not null default false,
  sort int not null default 0,
  -- Reservado para la sincronización bancaria (GoCardless/PSD2)
  provider text,
  external_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.balance_snapshots (
  account_id uuid not null references public.accounts (id) on delete cascade,
  date date not null default current_date,
  balance_cents bigint not null,
  primary key (account_id, date)
);

-- Vincular movimientos a una cuenta (lo rellenará la sincronización bancaria)
alter table public.transactions
  add column if not exists account_id uuid references public.accounts (id) on delete set null;

create index if not exists idx_accounts_household on public.accounts (household_id, sort);
create index if not exists idx_snapshots_date on public.balance_snapshots (date);

-- ---------- Histórico automático de saldos ----------
-- Cada vez que cambia el saldo se guarda el valor del día, que es lo que
-- alimenta la gráfica de evolución del patrimonio.

create or replace function public.snapshot_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.balance_snapshots (account_id, date, balance_cents)
  values (new.id, current_date, new.balance_cents)
  on conflict (account_id, date) do update set balance_cents = excluded.balance_cents;
  return new;
end;
$$;

drop trigger if exists on_account_balance_changed on public.accounts;
create trigger on_account_balance_changed
  after insert or update of balance_cents on public.accounts
  for each row execute function public.snapshot_balance();

-- ---------- Visibilidad ----------

create or replace function private.account_visible(acc uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.accounts a
    join public.household_members m on m.household_id = a.household_id
    where a.id = acc and m.user_id = auth.uid()
  );
$$;

alter table public.accounts enable row level security;
alter table public.balance_snapshots enable row level security;

drop policy if exists "cuentas del hogar" on public.accounts;
create policy "cuentas del hogar" on public.accounts
  for all using (private.is_member(household_id)) with check (private.is_member(household_id));

drop policy if exists "saldos del hogar" on public.balance_snapshots;
create policy "saldos del hogar" on public.balance_snapshots
  for all using (private.account_visible(account_id)) with check (private.account_visible(account_id));

alter publication supabase_realtime add table public.accounts;
