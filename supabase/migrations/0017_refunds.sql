-- Reembolsos: dinero gastado que ha vuelto (una devolución de una compra).
--
-- Un reembolso entra como positivo, pero NO es un ingreso: es un gasto que se
-- deshace. Contarlo como ingreso infla los ingresos y esconde el gasto real.
-- Con este flag se saca de los ingresos y se descuenta del gasto de su
-- categoría, que es como se debe contabilizar.

alter table public.transactions
  add column if not exists is_refund boolean not null default false;

comment on column public.transactions.is_refund is 'Devolución de una compra: no cuenta como ingreso, descuenta gasto.';
