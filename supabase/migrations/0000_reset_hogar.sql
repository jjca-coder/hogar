-- ============================================================
-- 0000 — RESET
--
-- ⚠️  DESTRUCTIVO: borra las tablas de la app anterior ("Hogar") y
--     también las de Aurora si quedaron de un intento anterior, para
--     que este script se pueda ejecutar tantas veces como haga falta.
--
--     Las CUENTAS DE USUARIO (auth.users) NO se tocan: se reutilizan,
--     así que no hay que volver a registrarse.
-- ============================================================

-- ---------- App anterior ----------
drop table if exists public.habit_checks cascade;
drop table if exists public.balance_snapshots cascade;
drop table if exists public.budgets cascade;

-- ---------- Aurora (por si hubo un intento previo a medias) ----------
drop table if exists public.dashboard_widgets cascade;
drop table if exists public.audit_log cascade;
drop table if exists public.attachments cascade;
drop table if exists public.reminders cascade;
drop table if exists public.notifications cascade;

drop table if exists public.task_comments cascade;
drop table if exists public.tasks cascade;
drop table if exists public.projects cascade;
drop table if exists public.areas cascade;

drop table if exists public.habit_rest_days cascade;
drop table if exists public.habit_entries cascade;
drop table if exists public.habits cascade;

drop table if exists public.investment_transactions cascade;
drop table if exists public.holdings cascade;
drop table if exists public.securities cascade;

drop table if exists public.exchange_rates cascade;
drop table if exists public.settlements cascade;
drop table if exists public.shared_expense_splits cascade;
drop table if exists public.shared_expenses cascade;
drop table if exists public.net_worth_snapshots cascade;
drop table if exists public.asset_valuations cascade;
drop table if exists public.assets cascade;
drop table if exists public.debts cascade;
drop table if exists public.goals cascade;
drop table if exists public.recurring_transactions cascade;
drop table if exists public.budget_lines cascade;
drop table if exists public.budget_periods cascade;
drop table if exists public.budgets cascade;

drop table if exists public.rules cascade;
drop table if exists public.transactions cascade;
drop table if exists public.categories cascade;
drop table if exists public.merchants cascade;
drop table if exists public.accounts cascade;
drop table if exists public.connections cascade;
drop table if exists public.institutions cascade;

drop table if exists public.user_settings cascade;
drop table if exists public.invitations cascade;
drop table if exists public.household_members cascade;
drop table if exists public.households cascade;
drop table if exists public.profiles cascade;

-- ---------- Funciones ----------
drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_new_household() cascade;
drop function if exists public.join_household_with_code(text) cascade;
drop function if exists public.accept_invitation(text) cascade;
drop function if exists public.snapshot_balance() cascade;

drop schema if exists private cascade;
