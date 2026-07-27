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
