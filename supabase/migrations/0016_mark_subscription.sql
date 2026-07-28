-- Marcar un movimiento como suscripción a mano.
--
-- Hasta ahora las suscripciones solo se deducían por repetición (3+ cargos
-- iguales). Pero a veces quieres marcar algo como suscripción desde el primer
-- cargo, o rescatar uno que el detector no pilla. Este flag fuerza que ese
-- comercio aparezca en "Suscripciones" aunque todavía no se repita.

alter table public.transactions
  add column if not exists is_subscription boolean not null default false;

comment on column public.transactions.is_subscription is 'Marcada a mano como suscripción; fuerza su aparición en Suscripciones.';

create index if not exists idx_transactions_subscription
  on public.transactions (household_id)
  where is_subscription;
