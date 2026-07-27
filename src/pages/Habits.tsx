import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { addDays, format, startOfWeek, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Flame, Plus, Trash2, X } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { todayISO } from '../lib/format'
import type { Habit, HabitCheck } from '../lib/types'

const EMOJIS = ['💪', '🏃', '🧘', '📚', '💧', '🥗', '😴', '🦷', '🚭', '💊', '🎸', '✍️', '🧹', '💰', '🌱', '🙏']

export default function Habits() {
  const { session, household, partner } = useApp()
  const uid = session!.user.id
  const [habits, setHabits] = useState<Habit[]>([])
  const [checks, setChecks] = useState<HabitCheck[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const today = todayISO()

  const load = async () => {
    if (!household) return
    const { data: hs } = await sb()
      .from('habits')
      .select('*')
      .eq('household_id', household.id)
      .eq('archived', false)
      .order('created_at')
    const list = (hs as Habit[]) ?? []
    setHabits(list)
    if (list.length) {
      const since = format(subDays(new Date(), 90), 'yyyy-MM-dd')
      const { data: cs } = await sb()
        .from('habit_checks')
        .select('*')
        .in('habit_id', list.map((h) => h.id))
        .gte('date', since)
      setChecks((cs as HabitCheck[]) ?? [])
    } else {
      setChecks([])
    }
  }

  useEffect(() => {
    load()
  }, [household?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const checkSet = useMemo(() => new Set(checks.map((c) => `${c.habit_id}|${c.date}`)), [checks])
  const has = (h: Habit, date: string) => checkSet.has(`${h.id}|${date}`)

  const streak = (h: Habit) => {
    let d = new Date()
    if (!has(h, today)) d = subDays(d, 1)
    let n = 0
    while (has(h, format(d, 'yyyy-MM-dd'))) {
      n++
      d = subDays(d, 1)
    }
    return n
  }

  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'))
  }, [])

  const toggleToday = async (h: Habit) => {
    if (h.owner !== uid) return
    if (has(h, today)) {
      await sb().from('habit_checks').delete().eq('habit_id', h.id).eq('date', today)
    } else {
      await sb().from('habit_checks').insert({ habit_id: h.id, date: today })
    }
    load()
  }

  const remove = async (h: Habit) => {
    if (!confirm(`¿Borrar "${h.name}" y todo su historial?`)) return
    await sb().from('habits').delete().eq('id', h.id)
    load()
  }

  const HabitCard = ({ h, mine }: { h: Habit; mine: boolean }) => {
    const s = streak(h)
    const doneToday = has(h, today)
    return (
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => toggleToday(h)}
            disabled={!mine}
            className={`w-11 h-11 rounded-2xl text-xl flex items-center justify-center shrink-0 transition-all ${
              doneToday ? 'bg-ink' : 'bg-stone-100'
            } ${mine ? 'active:scale-95' : 'cursor-default'}`}
            aria-label={doneToday ? 'Desmarcar hoy' : 'Marcar hoy'}
          >
            {h.emoji}
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[15px] truncate">{h.name}</p>
            <p className="text-xs text-stone-400 flex items-center gap-1 mt-0.5">
              <Flame size={12} className={s > 0 ? 'text-orange-500' : ''} />
              {s > 0 ? (s === 1 ? '1 día seguido' : `${s} días seguidos`) : 'Sin racha aún'}
            </p>
          </div>
          <div className="flex gap-1">
            {weekDays.map((d) => (
              <span
                key={d}
                className={`w-2 h-2 rounded-full ${
                  has(h, d) ? 'bg-ink' : d <= today ? 'bg-stone-200' : 'bg-stone-100'
                }`}
                title={format(new Date(d + 'T12:00:00'), 'EEE d', { locale: es })}
              />
            ))}
          </div>
          {mine && (
            <button
              className="p-1.5 text-stone-300 hover:text-rose-500"
              onClick={() => remove(h)}
              aria-label="Borrar"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    )
  }

  const mine = habits.filter((h) => h.owner === uid)
  const theirs = habits.filter((h) => h.owner !== uid)

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Hábitos</h1>
        <p className="text-stone-500 text-sm mt-0.5">La semana empieza el lunes</p>
      </header>

      <section className="space-y-2.5">
        <h2 className="section-title">Los míos</h2>
        {mine.length === 0 ? (
          <div className="card p-8 text-center text-stone-400">
            <p className="text-3xl mb-2">🌱</p>
            <p>Crea tu primer hábito con el botón +</p>
          </div>
        ) : (
          mine.map((h) => <HabitCard key={h.id} h={h} mine />)
        )}
      </section>

      {theirs.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="section-title">Los de {partner?.name ?? 'tu pareja'}</h2>
          {theirs.map((h) => (
            <HabitCard key={h.id} h={h} mine={false} />
          ))}
        </section>
      )}

      <button onClick={() => setShowAdd(true)} className="fab" aria-label="Nuevo hábito">
        <Plus size={26} />
      </button>

      {showAdd && (
        <AddHabit
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

function AddHabit({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { session, household } = useApp()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('💪')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await sb().from('habits').insert({
      household_id: household!.id,
      owner: session!.user.id,
      name: name.trim(),
      emoji,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="modal-sheet">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nuevo hábito</h2>
          <button type="button" className="p-1.5 text-stone-400" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div>
          <label className="label">Nombre</label>
          <input
            className="input"
            placeholder="Hacer ejercicio"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div>
          <label className="label">Icono</label>
          <div className="grid grid-cols-8 gap-1.5">
            {EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setEmoji(e)}
                className={`aspect-square rounded-xl text-xl flex items-center justify-center transition-all ${
                  emoji === e ? 'bg-ink/10 ring-2 ring-ink' : 'bg-stone-100'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button className="btn-primary w-full" disabled={busy || !name.trim()}>
          {busy ? 'Guardando…' : 'Crear hábito'}
        </button>
      </form>
    </div>
  )
}
