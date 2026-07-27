-- ============================================================
-- 0014 — El índice antiduplicados no puede ser parcial
--
-- Se creó como índice único PARCIAL (`where dedup_hash is not null`) y
-- PostgreSQL rechaza los índices parciales en ON CONFLICT: la
-- sincronización bancaria fallaba con 42P10 y no entraba ni un movimiento.
--
-- Al quitarle el WHERE sigue cumpliendo su función: en un índice único los
-- NULL no colisionan entre sí, así que los movimientos manuales (que no
-- llevan huella) pueden seguir siendo muchos por cuenta.
-- ============================================================

drop index if exists public.idx_transactions_dedup;

create unique index idx_transactions_dedup
  on public.transactions (account_id, dedup_hash);
