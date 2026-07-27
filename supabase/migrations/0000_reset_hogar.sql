-- ============================================================
-- 0000 — LIMPIEZA DE LA APP ANTERIOR ("Hogar")
--
-- ⚠️  DESTRUCTIVO: borra las tablas de Hogar y TODOS sus datos
--     (movimientos, tareas, hábitos y hogares creados allí).
--     Las CUENTAS DE USUARIO (auth.users) NO se tocan: Aurora
--     las reutiliza, así que no hay que volver a registrarse.
--
-- Ejecutar SOLO cuando se confirme que Hogar ya no se usa, y
-- ANTES de la migración 0001.
-- ============================================================

drop table if exists public.habit_checks cascade;
drop table if exists public.habits cascade;
drop table if exists public.tasks cascade;
drop table if exists public.budgets cascade;
drop table if exists public.transactions cascade;
drop table if exists public.categories cascade;
drop table if exists public.balance_snapshots cascade;
drop table if exists public.accounts cascade;
drop table if exists public.household_members cascade;
drop table if exists public.households cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_new_household() cascade;
drop function if exists public.join_household_with_code(text) cascade;
drop function if exists public.snapshot_balance() cascade;

drop function if exists private.is_member(uuid) cascade;
drop function if exists private.same_household(uuid) cascade;
drop function if exists private.habit_visible(uuid) cascade;
drop function if exists private.owns_habit(uuid) cascade;
drop function if exists private.account_visible(uuid) cascade;
