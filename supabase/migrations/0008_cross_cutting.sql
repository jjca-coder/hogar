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
