-- ============================================================
-- 0012 — El catálogo de bancos necesita escritura
--
-- `institutions` solo tenía política de SELECT, así que al conectar un
-- banco el upsert fallaba en silencio y después reventaba la inserción
-- en `connections` por su NOT NULL.
--
-- Es un catálogo compartido sin datos sensibles (nombre, país, logo):
-- cualquier usuario autenticado puede darlo de alta.
-- ============================================================

drop policy if exists institutions_insert on public.institutions;
create policy institutions_insert on public.institutions
  for insert to authenticated with check (true);

drop policy if exists institutions_update on public.institutions;
create policy institutions_update on public.institutions
  for update to authenticated using (true) with check (true);

-- Defensa en profundidad: una conexión debe poder existir aunque no se
-- haya podido registrar la entidad. Mejor una conexión sin logo que un
-- fallo a mitad del proceso de autorización.
alter table public.connections alter column institution_id drop not null;
