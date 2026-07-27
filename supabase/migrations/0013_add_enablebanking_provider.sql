-- ============================================================
-- 0013 — Enable Banking como agregador válido
--
-- La lista de proveedores se escribió cuando el plan era usar GoCardless.
-- Al cambiar a Enable Banking (GoCardless cerró los registros nuevos), el
-- CHECK rechazaba la inserción de la entidad.
--
-- Lección: una lista cerrada de proveedores en la base de datos obliga a
-- migrar cada vez que cambia el de turno. Se mantiene porque protege de
-- erratas, pero conviene recordarla al añadir uno nuevo.
-- ============================================================

alter table public.institutions drop constraint if exists institutions_provider_check;
alter table public.institutions add constraint institutions_provider_check
  check (provider in ('gocardless', 'tink', 'truelayer', 'plaid', 'enablebanking', 'manual'));
