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
