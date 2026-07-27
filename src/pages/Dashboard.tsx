import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowUpRight, ArrowDownRight, Check, ChevronRight, Copy, LogOut, Settings } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { eur, eurWhole, todayISO, upperFirst, initial } from '../lib/format'
import type { Account, Habit, HabitCheck, Task, Transaction } from '../lib/types'

export default function Dashboard() {
  const { session, profile, household, partner } = useApp()
  const uid = session!.user.id
  const [txs, setTxs] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [checks, setChecks] = useState<HabitCheck[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [copied, setCopied] = useState(false)

  const today = todayISO()

  const load = async () => {
    if (!household) return
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const [t1, t2, t3, t4, t5] = await Promise.all([
      sb().from('transactions').select('*').eq('household_id', household.id).gte('date', monthStart),
      sb()
        .from('tasks')
        .select('*')
        .eq('household_id', household.id)
        .is('done_at', null)
        .not('due_date', 'is', null)
        .lte('due_date', today)
        .order('due_date'),
      sb().from('habits').select('*').eq('household_id', household.id).eq('archived', false),
      sb().from('habit_checks').select('*').eq('date', today),
      sb()
        .from('accounts')
        .select('*')
        .eq('household_id', household.id)
        .eq('archived', false)
        .eq('include_in_net_worth', true),
    ])
    setTxs((t1.data as Transaction[]) ?? [])
    setTasks((t2.data as Task[]) ?? [])
    setHabits((t3.data as Habit[]) ?? [])
    setChecks((t4.data as HabitCheck[]) ?? [])
    setAccounts((t5.data as Account[]) ?? []) // vacío si aún falta la migración de cuentas
  }

  useEffect(() => {
    load()
  }, [household?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const netWorth = accounts.reduce((s, a) => s + a.balance_cents, 0)
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

  const toggleTask = async (task: Task) => {
    await sb().from('tasks').update({ done_at: new Date().toISOString() }).eq('id', task.id)
    load()
  }

  const myHabits = habits.filter((h) => h.owner === uid)
  const isChecked = (h: Habit) => checks.some((c) => c.habit_id === h.id)
  const doneCount = myHabits.filter(isChecked).length

  const toggleHabit = async (h: Habit) => {
    if (isChecked(h)) {
      await sb().from('habit_checks').delete().eq('habit_id', h.id).eq('date', today)
    } else {
      await sb().from('habit_checks').insert({ habit_id: h.id, date: today })
    }
    load()
  }

  const copyCode = async () => {
    if (!household) return
    await navigator.clipboard.writeText(household.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pt-4">
        <div>
          <p className="text-dim text-sm">{upperFirst(format(new Date(), "EEEE d 'de' LLLL", { locale: es }))}</p>
          <h1 className="text-2xl font-bold tracking-tight mt-0.5">Hola, {profile?.name}</h1>
        </div>
        <button
          className="w-10 h-10 rounded-full bg-raised flex items-center justify-center text-dim active:scale-95 transition-transform"
          onClick={() => setShowSettings(true)}
          aria-label="Ajustes"
        >
          <Settings size={18} />
        </button>
      </header>

      <Link to="/patrimonio" className="card block p-5 active:scale-[0.99] transition-transform">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Patrimonio neto</p>
          <ChevronRight size={16} className="text-faint" />
        </div>
        <p className="text-[38px] leading-[1.1] font-bold num mt-2">
          {accounts.length ? eurWhole(netWorth) : '—'}
        </p>
        {accounts.length === 0 && (
          <p className="text-dim text-sm mt-1.5">Añade tus cuentas para verlo</p>
        )}
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/finanzas" className="card p-4 active:scale-[0.98] transition-transform">
          <div className="flex items-center gap-1 text-down">
            <ArrowDownRight size={14} />
            <p className="eyebrow !text-down">Gastos</p>
          </div>
          <p className="text-xl font-bold num mt-1.5">{eur(spent)}</p>
          <p className="text-[11px] text-faint mt-0.5">este mes</p>
        </Link>
        <Link to="/finanzas" className="card p-4 active:scale-[0.98] transition-transform">
          <div className="flex items-center gap-1 text-up">
            <ArrowUpRight size={14} />
            <p className="eyebrow !text-up">Ingresos</p>
          </div>
          <p className="text-xl font-bold num mt-1.5">{eur(income)}</p>
          <p className="text-[11px] text-faint mt-0.5">este mes</p>
        </Link>
      </div>

      {partner && (
        <div className="card p-4 flex items-center gap-3">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ backgroundColor: partner.color }}
          >
            {initial(partner.name)}
          </span>
          <p className="text-sm flex-1">
            {balance === 0 ? (
              <span className="text-dim">Con {partner.name} estáis en paz</span>
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

      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="eyebrow">Tareas para hoy</h2>
          <Link to="/tareas" className="text-xs font-semibold text-dim">
            Ver todas
          </Link>
        </div>
        {tasks.length === 0 ? (
          <p className="text-faint text-sm">Nada pendiente hoy</p>
        ) : (
          <ul className="space-y-3">
            {tasks.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-center gap-3">
                <button
                  onClick={() => toggleTask(t)}
                  className="w-[22px] h-[22px] rounded-full border-2 border-hairline hover:border-bright shrink-0 transition-colors"
                  aria-label={`Completar ${t.title}`}
                />
                <span className="flex-1 text-[15px]">{t.title}</span>
                {t.due_date && t.due_date < today && (
                  <span className="text-[10px] font-bold text-down uppercase tracking-wider">
                    atrasada
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="eyebrow">
            Mis hábitos {myHabits.length > 0 && `· ${doneCount}/${myHabits.length}`}
          </h2>
          <Link to="/habitos" className="text-xs font-semibold text-dim">
            Ver todos
          </Link>
        </div>
        {myHabits.length === 0 ? (
          <p className="text-faint text-sm">Aún no tienes hábitos</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {myHabits.map((h) => {
              const done = isChecked(h)
              return (
                <button
                  key={h.id}
                  onClick={() => toggleHabit(h)}
                  className={`px-3.5 py-2 rounded-full border text-sm font-medium transition-all active:scale-95 ${
                    done ? 'bg-bright border-bright text-void' : 'border-hairline text-dim'
                  }`}
                >
                  {h.emoji} {h.name}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {showSettings && (
        <div className="sheet-overlay" onClick={() => setShowSettings(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{household?.name}</h2>
            <div>
              <p className="label">Código de invitación</p>
              <button
                onClick={copyCode}
                className="w-full flex items-center justify-center gap-3 bg-raised rounded-2xl py-4 text-2xl font-bold tracking-[0.3em] num"
              >
                {household?.invite_code}
                {copied ? (
                  <Check size={18} className="text-up" />
                ) : (
                  <Copy size={18} className="text-faint" />
                )}
              </button>
              <p className="text-xs text-faint mt-2">
                Compártelo para que se una desde su cuenta.
              </p>
            </div>
            <button className="btn-ghost w-full !text-down" onClick={() => sb().auth.signOut()}>
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
