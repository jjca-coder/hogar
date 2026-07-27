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
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Finanzas</h1>
        <div className="flex items-center bg-white border border-stone-200/80 rounded-full px-1 py-0.5">
          <button
            className="p-1.5 text-stone-400 hover:text-ink"
            onClick={() => setMonth(addMonths(month, -1))}
            aria-label="Mes anterior"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="text-sm font-semibold capitalize w-24 text-center">
            {monthLabel(month)}
          </span>
          <button
            className="p-1.5 text-stone-400 hover:text-ink"
            onClick={() => setMonth(addMonths(month, 1))}
            aria-label="Mes siguiente"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </header>

      <div className="card p-5">
        <div className="grid grid-cols-2">
          <div>
            <p className="section-title">Gastos</p>
            <p className="text-2xl font-extrabold tracking-tight tabular-nums mt-1">{eur(spent)}</p>
          </div>
          <div className="border-l border-stone-100 pl-5">
            <p className="section-title">Ingresos</p>
            <p className="text-2xl font-extrabold tracking-tight tabular-nums mt-1 text-emerald-700">
              {eur(income)}
            </p>
          </div>
        </div>
        {partner && (
          <div className="flex items-center gap-2 border-t border-stone-100 mt-4 pt-3.5">
            <Users size={15} className="text-stone-400 shrink-0" />
            <p className="text-sm">
              {balance === 0 ? (
                <span className="text-stone-500">Compartidos: en paz 🤝</span>
              ) : balance > 0 ? (
                <span className="font-semibold text-emerald-700">
                  {partner.name} te debe {eur(balance)}
                </span>
              ) : (
                <span className="font-semibold text-rose-600">
                  Debes {eur(-balance)} a {partner.name}
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {byCategory.length > 0 && (
        <section className="card p-5">
          <h2 className="section-title mb-4">Por categorías</h2>
          <div className="space-y-3.5">
            {byCategory.map((c) => (
              <div key={c.id} title={`${c.name}: ${eur(c.sum)}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-base leading-none">{c.emoji}</span>
                  <span className="flex-1 text-sm font-medium truncate">{c.name}</span>
                  <span className="text-sm font-bold tabular-nums">{eur(c.sum)}</span>
                  <span className="text-xs text-stone-400 tabular-nums w-9 text-right">
                    {Math.round((c.sum / spent) * 100)}%
                  </span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-ink rounded-full transition-[width] duration-300"
                    style={{ width: `${Math.max((c.sum / byCategory[0].sum) * 100, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {byDay.length === 0 ? (
        <div className="card p-8 text-center text-stone-400">
          <p className="text-3xl mb-2">🧾</p>
          <p>Sin movimientos este mes.</p>
        </div>
      ) : (
        byDay.map(([date, list]) => (
          <section key={date}>
            <h3 className="section-title mb-2">{upperFirst(dayLabel(date))}</h3>
            <div className="card divide-y divide-stone-100">
              {list.map((t) => {
                const cat = t.category_id ? catById.get(t.category_id) : undefined
                const payer = memberById.get(t.paid_by)
                return (
                  <div key={t.id} className="flex items-center gap-3 p-3.5">
                    <span className="emoji-tile">{cat?.emoji ?? '💸'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[15px] truncate">
                        {t.description || cat?.name || 'Movimiento'}
                      </p>
                      <p className="text-xs text-stone-400 flex items-center gap-1.5 mt-0.5">
                        {payer && (
                          <span
                            className="inline-flex w-4 h-4 rounded-full text-white text-[10px] font-bold items-center justify-center"
                            style={{ backgroundColor: payer.color }}
                          >
                            {initial(payer.name)}
                          </span>
                        )}
                        {cat?.name}
                        {t.is_shared && <Users size={12} className="inline" />}
                      </p>
                    </div>
                    <p
                      className={`font-bold tabular-nums whitespace-nowrap ${
                        t.kind === 'expense' ? 'text-ink' : 'text-emerald-700'
                      }`}
                    >
                      {t.kind === 'expense' ? '−' : '+'}
                      {eur(t.amount_cents)}
                    </p>
                    <button
                      className="p-1.5 text-stone-300 hover:text-rose-500"
                      onClick={() => remove(t)}
                      aria-label="Borrar"
                    >
                      <Trash2 size={16} />
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
    <div className="modal-overlay" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="modal-sheet">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nuevo movimiento</h2>
          <button type="button" className="p-1.5 text-stone-400" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="seg grid-cols-2">
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
              className={`seg-item ${kind === k ? 'seg-item-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <label className="label">Importe (€)</label>
          <input
            className="input text-2xl font-bold tabular-nums"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            required
          />
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
          <div className="grid grid-cols-3 gap-1.5 max-h-44 overflow-y-auto">
            {kindCats.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`chip !px-2 text-[13px] truncate ${categoryId === c.id ? 'chip-active' : ''}`}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="label">Pagado por</label>
            <div className="grid grid-cols-2 gap-1.5">
              {members.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setPaidBy(m.id)}
                  className={`chip !px-2 truncate ${paidBy === m.id ? 'chip-active' : ''}`}
                >
                  {m.id === uid ? 'Yo' : m.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {kind === 'expense' && (
          <label className="flex items-center gap-3 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="w-5 h-5 accent-stone-900"
            />
            <span className="font-medium text-[15px]">Gasto compartido (a medias)</span>
          </label>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}
