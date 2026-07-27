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
