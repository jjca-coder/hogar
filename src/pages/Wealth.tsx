import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { format, subMonths, subYears } from 'date-fns'
import { ArrowDownRight, ArrowUpRight, Landmark, Plus, Trash2, X } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { eur, eurWhole, parseAmount } from '../lib/format'
import { ACCOUNT_KINDS, type Account, type AccountKind, type BalanceSnapshot } from '../lib/types'
import NetWorthChart, { type Point } from '../components/NetWorthChart'

const RANGES = [
  { key: '1M', label: '1M', from: () => subMonths(new Date(), 1) },
  { key: '6M', label: '6M', from: () => subMonths(new Date(), 6) },
  { key: '1A', label: '1A', from: () => subYears(new Date(), 1) },
  { key: 'TODO', label: 'Todo', from: () => new Date(2000, 0, 1) },
] as const

export default function Wealth() {
  const { household } = useApp()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [snaps, setSnaps] = useState<BalanceSnapshot[]>([])
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('6M')
  const [editing, setEditing] = useState<Account | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)

  const load = async () => {
    if (!household) return
    const { data: accs, error } = await sb()
      .from('accounts')
      .select('*')
      .eq('household_id', household.id)
      .eq('archived', false)
      .order('sort')

    // 42P01 = la tabla no existe todavía (falta ejecutar migracion-02-cuentas.sql)
    if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
      setNeedsMigration(true)
      return
    }
    const list = (accs as Account[]) ?? []
    setAccounts(list)

    if (list.length) {
      const since = format(subYears(new Date(), 3), 'yyyy-MM-dd')
      const { data: ss } = await sb()
        .from('balance_snapshots')
        .select('*')
        .in('account_id', list.map((a) => a.id))
        .gte('date', since)
        .order('date')
      setSnaps((ss as BalanceSnapshot[]) ?? [])
    } else {
      setSnaps([])
    }
  }

  useEffect(() => {
    load()
  }, [household?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const counted = accounts.filter((a) => a.include_in_net_worth)
  const netWorth = counted.reduce((s, a) => s + a.balance_cents, 0)
  const assets = counted.filter((a) => a.balance_cents > 0).reduce((s, a) => s + a.balance_cents, 0)
  const debts = counted.filter((a) => a.balance_cents < 0).reduce((s, a) => s + a.balance_cents, 0)

  /** Patrimonio por día: para cada fecha con algún cambio, suma el último saldo conocido de cada cuenta. */
  const series = useMemo<Point[]>(() => {
    if (!snaps.length) return []
    const countedIds = new Set(counted.map((a) => a.id))
    const relevant = snaps.filter((s) => countedIds.has(s.account_id))
    if (!relevant.length) return []

    const from = format(RANGES.find((r) => r.key === range)!.from(), 'yyyy-MM-dd')
    const dates = [...new Set(relevant.map((s) => s.date))].sort()
    const last = new Map<string, number>()
    const out: Point[] = []

    for (const d of dates) {
      for (const s of relevant.filter((x) => x.date === d)) last.set(s.account_id, s.balance_cents)
      if (d >= from) {
        out.push({ date: d, value: [...last.values()].reduce((a, b) => a + b, 0) })
      }
    }
    // Si el rango recorta todo el histórico, arrancamos desde el estado previo
    if (out.length === 1 && dates.length > 1) {
      out.unshift({ date: dates[dates.length - 2], value: out[0].value })
    }
    // Cerrar siempre en el saldo actual
    const today = format(new Date(), 'yyyy-MM-dd')
    if (out.length && out[out.length - 1].date !== today) {
      out.push({ date: today, value: netWorth })
    }
    return out
  }, [snaps, counted, range, netWorth])

  const change = series.length > 1 ? series[series.length - 1].value - series[0].value : 0
  const changePct = series.length > 1 && series[0].value !== 0
    ? (change / Math.abs(series[0].value)) * 100
    : 0

  const grouped = useMemo(() => {
    const order: AccountKind[] = ['checking', 'savings', 'cash', 'investment', 'property', 'card', 'loan']
    return order
      .map((kind) => ({ kind, list: accounts.filter((a) => a.kind === kind) }))
      .filter((g) => g.list.length > 0)
  }, [accounts])

  const remove = async (a: Account) => {
    if (!confirm(`¿Borrar "${a.name}" y su histórico?`)) return
    await sb().from('accounts').delete().eq('id', a.id)
    setEditing(null)
    load()
  }

  if (needsMigration) {
    return (
      <div className="pt-10">
        <div className="card p-6 space-y-3">
          <Landmark size={26} className="text-faint" />
          <h1 className="text-xl font-bold">Falta un paso en la base de datos</h1>
          <p className="text-dim text-sm leading-relaxed">
            Ejecuta el archivo{' '}
            <code className="bg-raised px-1.5 py-0.5 rounded text-bright">
              supabase/migracion-02-cuentas.sql
            </code>{' '}
            en el SQL Editor de Supabase para activar las cuentas y el patrimonio.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="pt-3">
        <p className="eyebrow">Patrimonio neto</p>
        <h1 className="text-[44px] leading-[1.05] font-bold num mt-1.5">{eurWhole(netWorth)}</h1>
        {series.length > 1 && (
          <div className="flex items-center gap-1.5 mt-2">
            {change >= 0 ? (
              <ArrowUpRight size={16} className="text-up" />
            ) : (
              <ArrowDownRight size={16} className="text-down" />
            )}
            <span className={`text-sm font-semibold num ${change >= 0 ? 'text-up' : 'text-down'}`}>
              {change >= 0 ? '+' : '−'}
              {eur(Math.abs(change))}
            </span>
            <span className="text-sm text-dim num">
              ({changePct >= 0 ? '+' : '−'}
              {Math.abs(changePct).toFixed(1).replace('.', ',')}%)
            </span>
          </div>
        )}
      </header>

      <section className="card-flat p-4 pt-5">
        <NetWorthChart points={series} />
        <div className="flex gap-1.5 mt-4">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-colors ${
                range === r.key ? 'bg-raised text-bright' : 'text-faint'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      {accounts.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="eyebrow">Activos</p>
            <p className="text-xl font-bold num mt-1.5 text-up">{eurWhole(assets)}</p>
          </div>
          <div className="card p-4">
            <p className="eyebrow">Deudas</p>
            <p className="text-xl font-bold num mt-1.5 text-down">{eurWhole(debts)}</p>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="card p-8 text-center">
          <Landmark size={30} className="mx-auto text-faint mb-3" />
          <p className="font-semibold">Sin cuentas todavía</p>
          <p className="text-dim text-sm mt-1 mb-5">
            Añade tus cuentas, ahorros, inversiones y tarjetas para ver vuestro patrimonio real.
          </p>
          <button className="btn-primary w-full" onClick={() => setShowAdd(true)}>
            <Plus size={18} /> Añadir la primera cuenta
          </button>
        </div>
      ) : (
        grouped.map(({ kind, list }) => {
          const meta = ACCOUNT_KINDS[kind]
          const subtotal = list.reduce((s, a) => s + a.balance_cents, 0)
          return (
            <section key={kind}>
              <div className="flex items-baseline justify-between mb-2 px-1">
                <h2 className="eyebrow">{meta.plural}</h2>
                <span className="text-[13px] font-semibold num text-dim">{eur(subtotal)}</span>
              </div>
              <div className="card divide-hair overflow-hidden">
                {list.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setEditing(a)}
                    className="w-full flex items-center gap-3 p-4 text-left active:bg-raised transition-colors"
                  >
                    <span
                      className="w-1 h-9 rounded-full shrink-0"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span className="tile !w-10 !h-10 !text-lg">{meta.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{a.name}</p>
                      {a.institution && (
                        <p className="text-xs text-dim truncate mt-0.5">{a.institution}</p>
                      )}
                    </div>
                    <p
                      className={`font-bold num whitespace-nowrap ${
                        a.balance_cents < 0 ? 'text-down' : ''
                      }`}
                    >
                      {eur(a.balance_cents)}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )
        })
      )}

      {accounts.length > 0 && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl border border-dashed border-hairline text-dim font-semibold text-sm active:scale-[0.99] transition-transform"
        >
          <Plus size={17} /> Añadir cuenta
        </button>
      )}

      {(showAdd || editing) && (
        <AccountSheet
          account={editing}
          onClose={() => {
            setShowAdd(false)
            setEditing(null)
          }}
          onSaved={() => {
            setShowAdd(false)
            setEditing(null)
            load()
          }}
          onDelete={editing ? () => remove(editing) : undefined}
        />
      )}
    </div>
  )
}

function AccountSheet({
  account,
  onClose,
  onSaved,
  onDelete,
}: {
  account: Account | null
  onClose: () => void
  onSaved: () => void
  onDelete?: () => void
}) {
  const { household } = useApp()
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'checking')
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [balance, setBalance] = useState(
    account ? (Math.abs(account.balance_cents) / 100).toFixed(2).replace('.', ',') : '',
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isDebt = ACCOUNT_KINDS[kind].debt

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const cents = parseAmount(balance)
    if (!Number.isFinite(cents)) {
      setError('Pon un saldo válido, por ejemplo 1.250,40')
      return
    }
    // Las deudas se guardan en negativo aunque se escriban en positivo
    const signed = isDebt ? -Math.abs(cents) : cents
    setBusy(true)
    const payload = {
      name: name.trim(),
      kind,
      institution: institution.trim() || null,
      balance_cents: signed,
    }
    const { error } = account
      ? await sb().from('accounts').update(payload).eq('id', account.id)
      : await sb().from('accounts').insert({ ...payload, household_id: household!.id })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="sheet">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{account ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
          <button type="button" className="p-1.5 text-dim" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div>
          <label className="label">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(ACCOUNT_KINDS) as AccountKind[]).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-[13px] font-medium transition-all ${
                  kind === k
                    ? 'border-bright bg-raised text-bright'
                    : 'border-hairline text-dim'
                }`}
              >
                <span className="text-base">{ACCOUNT_KINDS[k].emoji}</span>
                <span className="truncate">{ACCOUNT_KINDS[k].label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Nombre</label>
          <input
            className="input"
            placeholder={isDebt ? 'Visa Santander' : 'Cuenta nómina'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!account}
            required
          />
        </div>

        <div>
          <label className="label">Banco o entidad (opcional)</label>
          <input
            className="input"
            placeholder="BBVA"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
          />
        </div>

        <div>
          <label className="label">
            {isDebt ? 'Cuánto debes ahora' : 'Saldo actual'} (€)
          </label>
          <input
            className="input text-2xl font-bold num"
            inputMode="decimal"
            placeholder="0,00"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            required
          />
          <p className="text-xs text-faint mt-2">
            {isDebt
              ? 'Escríbelo en positivo: se restará del patrimonio automáticamente.'
              : 'Cada vez que lo actualices se guarda el histórico para la gráfica.'}
          </p>
        </div>

        {error && <p className="text-sm text-down">{error}</p>}

        <button className="btn-primary w-full" disabled={busy || !name.trim()}>
          {busy ? 'Guardando…' : account ? 'Guardar cambios' : 'Añadir cuenta'}
        </button>

        {onDelete && (
          <button type="button" className="btn-ghost w-full !text-down" onClick={onDelete}>
            <Trash2 size={16} /> Borrar cuenta
          </button>
        )}
      </form>
    </div>
  )
}
