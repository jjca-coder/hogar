import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Settings, LogOut, Copy, Check, ChevronRight } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { eur, todayISO, upperFirst } from '../lib/format'
import type { Habit, HabitCheck, Task, Transaction } from '../lib/types'

export default function Dashboard() {
  const { session, profile, household, partner } = useApp()
  const uid = session!.user.id
  const [txs, setTxs] = useState<Transaction[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [checks, setChecks] = useState<HabitCheck[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [copied, setCopied] = useState(false)

  const today = todayISO()

  const load = async () => {
    if (!household) return
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const [t1, t2, t3, t4] = await Promise.all([
      sb()
        .from('transactions')
        .select('*')
        .eq('household_id', household.id)
        .gte('date', monthStart),
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
    ])
    setTxs((t1.data as Transaction[]) ?? [])
    setTasks((t2.data as Task[]) ?? [])
    setHabits((t3.data as Habit[]) ?? [])
    setChecks((t4.data as HabitCheck[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [household?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const spent = txs
    .filter((t) => t.kind === 'expense')
    .reduce((s, t) => s + t.amount_cents, 0)

  const sharedByMe = txs
    .filter((t) => t.kind === 'expense' && t.is_shared && t.paid_by === uid)
    .reduce((s, t) => s + t.amount_cents, 0)
  const sharedByPartner = txs
    .filter((t) => t.kind === 'expense' && t.is_shared && t.paid_by !== uid)
    .reduce((s, t) => s + t.amount_cents, 0)
  const balance = Math.round((sharedByMe - sharedByPartner) / 2)

  const toggleTask = async (task: Task) => {
    await sb().from('tasks').update({ done_at: new Date().toISOString() }).eq('id', task.id)
    load()
  }

  const myHabits = habits.filter((h) => h.owner === uid)
  const isChecked = (h: Habit) => checks.some((c) => c.habit_id === h.id)

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
    <div className="space-y-4">
      <header className="flex items-start justify-between pt-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Hola, {profile?.name}</h1>
          <p className="text-stone-500 text-sm mt-0.5">
            {upperFirst(format(new Date(), "EEEE d 'de' LLLL", { locale: es }))}
          </p>
        </div>
        <button
          className="p-2 -mr-1 text-stone-400 hover:text-ink transition-colors"
          onClick={() => setShowSettings(true)}
          aria-label="Ajustes"
        >
          <Settings size={21} />
        </button>
      </header>

      <Link to="/finanzas" className="card block p-5">
        <div className="flex items-center justify-between">
          <p className="section-title">
            Gastado en {format(new Date(), 'LLLL', { locale: es })}
          </p>
          <ChevronRight size={16} className="text-stone-300" />
        </div>
        <p className="text-4xl font-extrabold tracking-tight tabular-nums mt-2">{eur(spent)}</p>
        {partner && (
          <p className="text-sm mt-2.5">
            {balance === 0 ? (
              <span className="text-stone-500">Gastos compartidos: en paz 🤝</span>
            ) : balance > 0 ? (
              <span className="text-emerald-700 font-semibold">
                {partner.name} te debe {eur(balance)}
              </span>
            ) : (
              <span className="text-rose-600 font-semibold">
                Debes {eur(-balance)} a {partner.name}
              </span>
            )}
          </p>
        )}
      </Link>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="section-title">Tareas para hoy</h2>
          <Link to="/tareas" className="text-xs font-semibold text-stone-400 hover:text-ink">
            Ver todas
          </Link>
        </div>
        {tasks.length === 0 ? (
          <p className="text-stone-400 text-sm">Nada pendiente. 🌴</p>
        ) : (
          <ul className="space-y-2.5">
            {tasks.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-3">
                <button
                  onClick={() => toggleTask(t)}
                  className="w-[22px] h-[22px] rounded-full border-2 border-stone-300 hover:border-ink shrink-0 transition-colors"
                  aria-label={`Completar ${t.title}`}
                />
                <span className="flex-1 text-[15px]">{t.title}</span>
                {t.due_date && t.due_date < today && (
                  <span className="text-[11px] font-bold text-rose-500 uppercase tracking-wide">
                    atrasada
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="section-title">Mis hábitos de hoy</h2>
          <Link to="/habitos" className="text-xs font-semibold text-stone-400 hover:text-ink">
            Ver todos
          </Link>
        </div>
        {myHabits.length === 0 ? (
          <p className="text-stone-400 text-sm">Aún no tienes hábitos. Crea el primero.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {myHabits.map((h) => {
              const done = isChecked(h)
              return (
                <button
                  key={h.id}
                  onClick={() => toggleHabit(h)}
                  className={`px-3.5 py-2 rounded-full border text-sm font-medium transition-colors ${
                    done
                      ? 'bg-ink border-ink text-white'
                      : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
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
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{household?.name}</h2>
            <div>
              <p className="text-sm text-stone-500 mb-1.5">Código de invitación para tu pareja</p>
              <button
                onClick={copyCode}
                className="w-full flex items-center justify-center gap-2 bg-stone-100 rounded-xl py-3 text-xl font-mono font-bold tracking-[0.3em]"
              >
                {household?.invite_code}
                {copied ? (
                  <Check size={18} className="text-emerald-600" />
                ) : (
                  <Copy size={18} className="text-stone-400" />
                )}
              </button>
            </div>
            <button className="btn-ghost w-full text-rose-600" onClick={() => sb().auth.signOut()}>
              <LogOut size={18} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
