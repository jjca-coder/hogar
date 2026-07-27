-- ============================================================
-- 0010 — Perfiles a prueba de OAuth
--
-- Con Google el nombre no viene en `name` sino a veces en `full_name`,
-- y el usuario puede existir en auth.users sin perfil si el trigger
-- se saltó por cualquier motivo. Sin perfil no se puede crear un hogar,
-- porque household_members.user_id apunta a profiles.
--
-- Este script: (1) mejora el trigger, (2) repara lo que ya esté roto.
-- Es seguro ejecutarlo varias veces.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),   -- Google
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Sin nombre'
  );

  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, v_name, new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
exception
  -- Nunca impedir el alta de un usuario porque falle el perfil:
  -- se repara después con el bloque de abajo.
  when others then
    return new;
end;
$$;

-- ---------- Reparación de lo existente ----------

insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Sin nombre'
  ),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

insert into public.user_settings (user_id)
select u.id
from auth.users u
left join public.user_settings s on s.user_id = u.id
where s.user_id is null;

-- Si alguien entró con Google y su perfil quedó sin nombre, se rellena
update public.profiles p
set display_name = coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(u.email, ''), '@', 1)
    )
from auth.users u
where u.id = p.id and coalesce(trim(p.display_name), '') = '';
