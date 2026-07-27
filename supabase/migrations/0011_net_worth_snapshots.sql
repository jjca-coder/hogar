-- ============================================================
-- 0011 — Foto automática del patrimonio
--
-- Cada vez que cambia el saldo de una cuenta se recalcula la foto del
-- día. Una fila por hogar y día: así la gráfica de evolución es una
-- consulta directa en vez de reconstruir saldos históricos.
-- ============================================================

create or replace function private.capture_net_worth(h uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_assets bigint;
  v_liabilities bigint;
  v_breakdown jsonb;
begin
  select
    coalesce(sum(current_balance) filter (where current_balance > 0), 0),
    coalesce(sum(current_balance) filter (where current_balance < 0), 0),
    coalesce(jsonb_object_agg(type, total) filter (where total is not null), '{}'::jsonb)
  into v_assets, v_liabilities, v_breakdown
  from (
    select
      type,
      current_balance,
      sum(current_balance) over (partition by type) as total
    from public.accounts
    where household_id = h and archived = false and include_in_net_worth = true
  ) s;

  insert into public.net_worth_snapshots
    (household_id, captured_on, assets_total, liabilities_total, net_worth, breakdown)
  values
    (h, current_date, v_assets, v_liabilities, v_assets + v_liabilities, coalesce(v_breakdown, '{}'::jsonb))
  on conflict (household_id, captured_on) do update
    set assets_total = excluded.assets_total,
        liabilities_total = excluded.liabilities_total,
        net_worth = excluded.net_worth,
        breakdown = excluded.breakdown;
end;
$$;

create or replace function public.on_account_balance_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.capture_net_worth(coalesce(new.household_id, old.household_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists accounts_snapshot on public.accounts;
create trigger accounts_snapshot
  after insert or update of current_balance, include_in_net_worth, archived
  or delete
  on public.accounts
  for each row execute function public.on_account_balance_changed();

-- Foto inicial para los hogares que ya tengan cuentas
do $$
declare r record;
begin
  for r in select distinct household_id from public.accounts loop
    perform private.capture_net_worth(r.household_id);
  end loop;
end $$;
