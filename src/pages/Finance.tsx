import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { addMonths, format, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Trash2, Users, X } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { eur, parseAmount, dayLabel, monthLabel, todayISO, initial, upperFirst } from '../lib/format'
import type { Category, Kind, Transaction } from '../lib/types'

export default function Finance() {
  const { session, household, members, partner } = useApp()
  const uid = session!.user.id
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [txs, setTxs] = useState<Transaction[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [showAdd, setShowAdd] = useState(false)

  const load = async () => {
    if (!household) return
    const from = format(month, 'yyyy-MM-dd')
    const to = format(addMonths(month, 1), 'yyyy-MM-dd')
    const { data } = await sb()
      .from('transactions')
      .select('*')
      .eq('household_id', household.id)
      .gte('date', from)
      .lt('date', to)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    setTxs((data as Transaction[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [household?.id, month]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!household) return
    sb()
      .from('categories')
      .select('*')
      .eq('household_id', household.id)
      .order('sort')
      .then(({ data }) => setCats((data as Category[]) ?? []))
  }, [household?.id])

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  const expenses = txs.filter((t) => t.kind === 'expense')
  const spent = expenses.reduce((s, t) => s + t.amount_cents, 0)
  const income = txs.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount_cents, 0)

  const sharedByMe = expenses
    .filter((t) => t.is_shared && t.paid_by === uid)
    .reduce((s, t) => s + t.amount_cents, 0)
  const sharedByPartner = expenses
    .filter((t) => t.is_shared && t.paid_by !== uid)
    .reduce((s, t) => s + t.amount_cents, 0)
  const balance = Math.round((sharedByMe - sharedByPartner) / 2)

  const byCategory = useMemo(() => {
    const sums = new Map<string, number>()
    for (const t of expenses) {
      const k = t.category_id ?? 'sin'
      sums.set(k, (sums.get(k) ?? 0) + t.amount_cents)
    }
    return [...sums.entries()]
      .map(([id, sum]) => ({
        id,
        name: id === 'sin' ? 'Sin categoría' : (catById.get(id)?.name ?? 'Sin categoría'),
        emoji: id === 'sin' ? '💸' : (catById.get(id)?.emoji ?? '💸'),
        sum,
      }))
      .sort((a, b) => b.sum - a.sum)
  }, [expenses, catById]) // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = useMemo(() => {
    const m = new Map<string, Transaction[]>()
    for (const t of txs) {
      const list = m.get(t.date) ?? []
      list.push(t)
      m.set(t.date, list)
    }
    return [...m.entries()]
  }, [txs])

  const remove = async (t: Transaction) => {
    if (!confirm(`¿Borrar "${t.description || catById.get(t.category_id ?? '')?.name}"?`)) return
    await sb().from('transactions').delete().eq('id', t.id)
    load()
  }

  return (
    <div className="space-y-5">
      <header className="pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
          <div className="flex items-center bg-surface border border-hairline rounded-full px-1">
            <button
              className="p-2 text-dim active:text-bright"
              onClick={() => setMonth(addMonths(month, -1))}
              aria-label="Mes anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[13px] font-semibold w-[104px] text-center">
              {upperFirst(monthLabel(month))}
            </span>
            <button
              className="p-2 text-dim active:text-bright"
              onClick={() => setMonth(addMonths(month, 1))}
              aria-label="Mes siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <p className="text-[40px] leading-[1.1] font-bold num mt-3">{eur(spent)}</p>
        <p className="text-dim text-sm mt-1">
          Ingresos <span className="text-up font-semibold num">{eur(income)}</span>
        </p>
      </header>

      {partner && expenses.some((t) => t.is_shared) && (
        <div className="card p-4 flex items-center gap-3">
          <Users size={16} className="text-faint shrink-0" />
          <p className="text-sm">
            {balance === 0 ? (
              <span className="text-dim">Compartidos: en paz</span>
            ) : balance > 0 ? (
              <>
                <span className="text-dim">{partner.name} te debe </span>
                <b className="text-up num">{eur(balance)}</b>
              </>
            ) : (
              <>
                <span className="text-dim">Debes a {partner.name} </span>
                <b className="text-down num">{eur(-balance)}</b>
              </>
            )}
          </p>
        </div>
      )}

      {byCategory.length > 0 && (
        <section className="card p-5">
          <h2 className="eyebrow mb-4">En qué se va</h2>
          <div className="space-y-4">
            {byCategory.map((c) => (
              <div key={c.id}>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[15px] leading-none">{c.emoji}</span>
                  <span className="flex-1 text-sm font-medium truncate">{c.name}</span>
                  <span className="text-sm font-bold num">{eur(c.sum)}</span>
                  <span className="text-xs text-faint num w-9 text-right">
                    {Math.round((c.sum / spent) * 100)}%
                  </span>
                </div>
                <div className="h-1 bg-raised rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-bright rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.max((c.sum / byCategory[0].sum) * 100, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {byDay.length === 0 ? (
        <div className="card p-10 text-center text-faint">
          <p className="text-sm">Sin movimientos este mes</p>
        </div>
      ) : (
        byDay.map(([date, list]) => (
          <section key={date}>
            <h3 className="eyebrow mb-2 px-1">{upperFirst(dayLabel(date))}</h3>
            <div className="card divide-hair overflow-hidden">
              {list.map((t) => {
                const cat = t.category_id ? catById.get(t.category_id) : undefined
                const payer = memberById.get(t.paid_by)
                return (
                  <div key={t.id} className="flex items-center gap-3 p-4">
                    <span className="tile">{cat?.emoji ?? '💸'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {t.description || cat?.name || 'Movimiento'}
                      </p>
                      <p className="text-xs text-faint flex items-center gap-1.5 mt-1">
                        {payer && (
                          <span
                            className="inline-flex w-4 h-4 rounded-full text-white text-[9px] font-bold items-center justify-center"
                            style={{ backgroundColor: payer.color }}
                          >
                            {initial(payer.name)}
                          </span>
                        )}
                        {cat?.name}
                        {t.is_shared && <Users size={11} />}
                      </p>
                    </div>
                    <p
                      className={`font-bold num whitespace-nowrap ${
                        t.kind === 'income' ? 'text-up' : ''
                      }`}
                    >
                      {t.kind === 'expense' ? '−' : '+'}
                      {eur(t.amount_cents)}
                    </p>
                    <button
                      className="p-1 text-faint active:text-down"
                      onClick={() => remove(t)}
                      aria-label="Borrar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}

      <button onClick={() => setShowAdd(true)} className="fab" aria-label="Añadir movimiento">
        <Plus size={26} />
      </button>

      {showAdd && (
        <AddTransaction
          cats={cats}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function AddTransaction({
  cats,
  onClose,
  onSaved,
}: {
  cats: Category[]
  onClose: () => void
  onSaved: () => void
}) {
  const { session, household, members } = useApp()
  const uid = session!.user.id
  const [kind, setKind] = useState<Kind>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [paidBy, setPaidBy] = useState(uid)
  const [isShared, setIsShared] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const kindCats = cats.filter((c) => c.kind === kind)

  useEffect(() => {
    setCategoryId(kindCats[0]?.id ?? '')
  }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const cents = parseAmount(amount)
    if (!Number.isFinite(cents) || cents <= 0) {
      setError('Pon un importe válido, por ejemplo 12,50')
      return
    }
    setBusy(true)
    const { error } = await sb().from('transactions').insert({
      household_id: household!.id,
      kind,
      amount_cents: cents,
      description: description.trim(),
      category_id: categoryId || null,
      date,
      paid_by: paidBy,
      is_shared: kind === 'expense' ? isShared : false,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="sheet">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Nuevo movimiento</h2>
          <button type="button" className="p-1.5 text-dim" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-raised rounded-2xl p-1">
          {(
            [
              ['expense', 'Gasto'],
              ['income', 'Ingreso'],
            ] as const
          ).map(([k, label]) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                kind === k ? 'bg-bright text-void' : 'text-dim'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <label className="label">Importe</label>
          <div className="relative">
            <input
              className="input text-3xl font-bold num pr-10"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-faint">
              €
            </span>
          </div>
        </div>

        <div>
          <label className="label">Descripción</label>
          <input
            className="input"
            placeholder="Compra del Mercadona"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Categoría</label>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {kindCats.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`chip ${categoryId === c.id ? 'chip-on' : ''}`}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha</label>
            <input
              className="input !py-3"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Pagado por</label>
            <div className="flex gap-2">
              {members.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setPaidBy(m.id)}
                  className={`chip flex-1 truncate ${paidBy === m.id ? 'chip-on' : ''}`}
                >
                  {m.id === uid ? 'Yo' : m.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {kind === 'expense' && (
          <button
            type="button"
            onClick={() => setIsShared(!isShared)}
            className="flex items-center gap-3 w-full text-left"
          >
            <span
              className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                isShared ? 'bg-bright' : 'bg-raised'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                  isShared ? 'left-6 bg-void' : 'left-1 bg-faint'
                }`}
              />
            </span>
            <span className="font-medium text-[15px]">Gasto compartido (a medias)</span>
          </button>
        )}

        {error && <p className="text-sm text-down">{error}</p>}

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}
