-- Procedencia de los movimientos: guardar lo que manda el banco y quién pagó.
--
-- `raw`          El objeto original del agregador, tal cual. Sirve para
--                diagnosticar (por qué una cuenta no trae movimientos) y para
--                rescatar campos que hoy no usamos sin volver a sincronizar.
-- `counterparty` El nombre del cobrador/ordenante que manda el banco. En una
--                cuenta conjunta ayuda a saber de quién salió o a quién fue.
-- `paid_by`      En una cuenta conjunta, quién de los dos puso el dinero. El
--                banco rara vez lo dice por PSD2, así que se puede fijar a mano.

alter table public.transactions
  add column if not exists raw jsonb,
  add column if not exists counterparty text,
  add column if not exists paid_by uuid references public.profiles(id) on delete set null;

comment on column public.transactions.raw is 'Payload original del agregador bancario, para diagnóstico y campos futuros.';
comment on column public.transactions.counterparty is 'Nombre del cobrador u ordenante según el banco.';
comment on column public.transactions.paid_by is 'En cuentas conjuntas, qué miembro puso el dinero.';

-- Filtrar "lo que pagué yo en la conjunta" sin escanear toda la tabla.
create index if not exists idx_transactions_paid_by
  on public.transactions (paid_by)
  where paid_by is not null;
