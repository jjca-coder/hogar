import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { addDays, format, startOfWeek, subDays } from 'date-fns'
import { Flame, Plus, Trash2, X } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { todayISO } from '../lib/format'
import type { Habit, HabitCheck } from '../lib/types'

const EMOJIS = ['💪', '🏃', '🧘', '📚', '💧', '🥗', '😴', '🦷', '🚭', '💊', '🎸', '✍️', '🧹', '💰', '🌱', '🙏']
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

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

  const toggle = async (h: Habit, date: string) => {
    if (h.owner !== uid || date > today) return
    if (has(h, date)) {
      await sb().from('habit_checks').delete().eq('habit_id', h.id).eq('date', date)
    } else {
      await sb().from('habit_checks').insert({ habit_id: h.id, date })
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
    return (
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-4">
          <span className="tile">{h.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{h.name}</p>
            <p className="text-xs flex items-center gap-1 mt-0.5">
              <Flame size={11} className={s > 0 ? 'text-orange-400' : 'text-faint'} />
              <span className={s > 0 ? 'text-dim' : 'text-faint'}>
                {s > 0 ? (s === 1 ? '1 día seguido' : `${s} días seguidos`) : 'Sin racha'}
              </span>
            </p>
          </div>
          {mine && (
            <button
              className="p-1 text-faint active:text-down"
              onClick={() => remove(h)}
              aria-label="Borrar"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>

        <div className="flex justify-between gap-1.5">
          {weekDays.map((d, i) => {
            const done = has(h, d)
            const future = d > today
            const isToday = d === today
            return (
              <button
                key={d}
                onClick={() => toggle(h, d)}
                disabled={!mine || future}
                className={`flex-1 flex flex-col items-center gap-1.5 py-1 rounded-xl transition-all ${
                  mine && !future ? 'active:scale-95' : ''
                }`}
                aria-label={`${WEEKDAYS[i]} ${done ? 'hecho' : 'no hecho'}`}
              >
                <span
                  className={`text-[10px] font-bold ${isToday ? 'text-bright' : 'text-faint'}`}
                >
                  {WEEKDAYS[i]}
                </span>
                <span
                  className={`w-full aspect-square max-w-[34px] rounded-xl transition-colors ${
                    done
                      ? 'bg-bright'
                      : future
                        ? 'bg-raised/40'
                        : isToday
                          ? 'bg-raised border border-hairline'
                          : 'bg-raised'
                  }`}
                />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const mine = habits.filter((h) => h.owner === uid)
  const theirs = habits.filter((h) => h.owner !== uid)

  return (
    <div className="space-y-5">
      <header className="pt-4">
        <h1 className="text-2xl font-bold tracking-tight">Hábitos</h1>
        <p className="text-dim text-sm mt-0.5">Toca cualquier día para marcarlo</p>
      </header>

      <section className="space-y-3">
        <h2 className="eyebrow px-1">Los míos</h2>
        {mine.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-3xl mb-3">🌱</p>
            <p className="text-dim text-sm">Crea tu primer hábito con el botón +</p>
          </div>
        ) : (
          mine.map((h) => <HabitCard key={h.id} h={h} mine />)
        )}
      </section>

      {theirs.length > 0 && (
        <section className="space-y-3">
          <h2 className="eyebrow px-1">Los de {partner?.name ?? 'tu pareja'}</h2>
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
    <div className="sheet-overlay" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="sheet">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Nuevo hábito</h2>
          <button type="button" className="p-1.5 text-dim" onClick={onClose} aria-label="Cerrar">
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
          <div className="grid grid-cols-8 gap-2">
            {EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setEmoji(e)}
                className={`aspect-square rounded-2xl text-xl flex items-center justify-center transition-all ${
                  emoji === e ? 'bg-raised ring-2 ring-bright' : 'bg-raised'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-down">{error}</p>}

        <button className="btn-primary w-full" disabled={busy || !name.trim()}>
          {busy ? 'Guardando…' : 'Crear hábito'}
        </button>
      </form>
    </div>
  )
}
