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
