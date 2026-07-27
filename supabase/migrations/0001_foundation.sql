-- ============================================================
-- 0001 — Extensiones, esquema privado y helpers de permisos
--
-- Los helpers viven en `private` (esquema NO expuesto por la API) y son
-- SECURITY DEFINER para romper la recursión de RLS: una política sobre
-- household_members no puede consultar household_members a través de RLS.
-- Patrón heredado de la app anterior, donde ya quedó validado.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ---------- Helpers de pertenencia ----------

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

/** Hogar al que pertenece una cuenta bancaria, para políticas en cascada. */
create or replace function private.account_household(acc uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select household_id from public.accounts where id = acc;
$$;

-- ---------- Utilidad: updated_at automático ----------

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
