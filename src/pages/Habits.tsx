import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { addDays, format, getISODay, startOfWeek, subDays } from 'date-fns'
import { Flame, Plus, Trash2, X } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { todayISO } from '../lib/format'
import {
  FREQUENCY_LABELS,
  WEEKDAY_LETTERS,
  doneInCurrentPeriod,
  frequencyText,
  streak,
  streakUnit,
} from '../lib/habits'
import type { Frequency, Habit, HabitCheck } from '../lib/types'

const EMOJIS = ['💪', '🏃', '🧘', '📚', '💧', '🥗', '😴', '🦷', '🚭', '💊', '🎸', '✍️', '🧹', '💰', '🌱', '🙏']

export default function Habits() {
  const { session, household, partner } = useApp()
  const uid = session!.user.id
  const [habits, setHabits] = useState<Habit[]>([])
  const [checks, setChecks] = useState<HabitCheck[]>([])
  const [editing, setEditing] = useState<Habit | null>(null)
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
    const list = ((hs as Habit[]) ?? []).map((h) => ({
      // Valores por defecto si aún no se ha aplicado la migración 03
      ...h,
      frequency: h.frequency ?? 'daily',
      target_count: h.target_count ?? 1,
      weekdays: h.weekdays ?? [1, 2, 3, 4, 5, 6, 7],
    }))
    setHabits(list)
    if (list.length) {
      const since = format(subDays(new Date(), 400), 'yyyy-MM-dd')
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

  const datesByHabit = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const c of checks) {
      if (!m.has(c.habit_id)) m.set(c.habit_id, new Set())
      m.get(c.habit_id)!.add(c.date)
    }
    return m
  }, [checks])

  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'))
  }, [])

  const toggle = async (h: Habit, date: string) => {
    if (h.owner !== uid || date > today) return
    const dates = datesByHabit.get(h.id) ?? new Set()
    if (dates.has(date)) {
      await sb().from('habit_checks').delete().eq('habit_id', h.id).eq('date', date)
    } else {
      await sb().from('habit_checks').insert({ habit_id: h.id, date })
    }
    load()
  }

  const remove = async (h: Habit) => {
    if (!confirm(`¿Borrar "${h.name}" y todo su historial?`)) return
    await sb().from('habits').delete().eq('id', h.id)
    setEditing(null)
    load()
  }

  const HabitCard = ({ h, mine }: { h: Habit; mine: boolean }) => {
    const dates = datesByHabit.get(h.id) ?? new Set<string>()
    const s = streak(h, dates)
    const periodic = h.frequency === 'weekly' || h.frequency === 'monthly'
    const done = periodic ? doneInCurrentPeriod(h, dates) : 0
    const target = h.target_count ?? 1

    return (
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            className="tile"
            onClick={() => mine && setEditing(h)}
            disabled={!mine}
            aria-label={mine ? `Editar ${h.name}` : h.name}
          >
            {h.emoji}
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{h.name}</p>
            <p className="text-xs flex items-center gap-1.5 mt-0.5 min-w-0">
              <Flame size={11} className={`shrink-0 ${s > 0 ? 'text-orange-400' : 'text-faint'}`} />
              <span className={`whitespace-nowrap ${s > 0 ? 'text-dim' : 'text-faint'}`}>
                {s > 0 ? `${s} ${streakUnit(h, s)}` : 'Sin racha'}
              </span>
              <span className="text-faint shrink-0">·</span>
              <span className="text-faint truncate">{frequencyText(h)}</span>
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

        {periodic && (
          <div className="mb-3.5">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs text-dim">
                {h.frequency === 'weekly' ? 'Esta semana' : 'Este mes'}
              </span>
              <span className="text-xs font-bold num">
                {done} <span className="text-faint">de {target}</span>
              </span>
            </div>
            <div className="h-1.5 bg-raised rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  done >= target ? 'bg-up' : 'bg-bright'
                }`}
                style={{ width: `${Math.min((done / target) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-between gap-1.5">
          {weekDays.map((d, i) => {
            const isDone = dates.has(d)
            const future = d > today
            const isToday = d === today
            // En "días concretos" se atenúan los días que no tocan
            const offDay =
              h.frequency === 'weekdays' && !(h.weekdays ?? []).includes(getISODay(new Date(d + 'T12:00:00')))
            return (
              <button
                key={d}
                onClick={() => toggle(h, d)}
                disabled={!mine || future}
                className={`flex-1 flex flex-col items-center gap-1.5 py-1 rounded-xl transition-all ${
                  mine && !future ? 'active:scale-95' : ''
                }`}
                aria-label={`${WEEKDAY_LETTERS[i]} ${isDone ? 'hecho' : 'no hecho'}`}
              >
                <span className={`text-[10px] font-bold ${isToday ? 'text-bright' : 'text-faint'}`}>
                  {WEEKDAY_LETTERS[i]}
                </span>
                <span
                  className={`w-full aspect-square max-w-[34px] rounded-xl transition-colors ${
                    isDone
                      ? 'bg-bright'
                      : offDay
                        ? 'bg-raised/30'
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
        <p className="text-dim text-sm mt-0.5">Toca un día para marcarlo, el icono para editar</p>
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

      {(showAdd || editing) && (
        <HabitSheet
          habit={editing}
          onClose={() => {
            setShowAdd(false)
            setEditing(null)
          }}
          onSaved={() => {
            setShowAdd(false)
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function HabitSheet({
  habit,
  onClose,
  onSaved,
}: {
  habit: Habit | null
  onClose: () => void
  onSaved: () => void
}) {
  const { session, household } = useApp()
  const [name, setName] = useState(habit?.name ?? '')
  const [emoji, setEmoji] = useState(habit?.emoji ?? '💪')
  const [frequency, setFrequency] = useState<Frequency>(habit?.frequency ?? 'daily')
  const [targetCount, setTargetCount] = useState(habit?.target_count ?? 3)
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? [1, 3, 5])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const toggleDay = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))

  const maxTarget = frequency === 'monthly' ? 31 : 7

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (frequency === 'weekdays' && weekdays.length === 0) {
      setError('Elige al menos un día de la semana.')
      return
    }
    setBusy(true)
    const payload = {
      name: name.trim(),
      emoji,
      frequency,
      target_count: frequency === 'weekly' || frequency === 'monthly' ? targetCount : 1,
      weekdays: frequency === 'weekdays' ? weekdays : [1, 2, 3, 4, 5, 6, 7],
    }
    const { error } = habit
      ? await sb().from('habits').update(payload).eq('id', habit.id)
      : await sb()
          .from('habits')
          .insert({ ...payload, household_id: household!.id, owner: session!.user.id })
    setBusy(false)
    if (error) {
      setError(
        error.message.includes('column')
          ? 'Falta aplicar la migración 03 en Supabase para usar frecuencias.'
          : error.message,
      )
    } else onSaved()
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="sheet">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{habit ? 'Editar hábito' : 'Nuevo hábito'}</h2>
          <button type="button" className="p-1.5 text-dim" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div>
          <label className="label">Nombre</label>
          <input
            className="input"
            placeholder="Ir al gimnasio"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!habit}
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

        <div>
          <label className="label">¿Cada cuánto?</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
              <button
                type="button"
                key={f}
                onClick={() => setFrequency(f)}
                className={`px-3 py-2.5 rounded-2xl border text-[13px] font-medium transition-all ${
                  frequency === f ? 'border-bright bg-raised text-bright' : 'border-hairline text-dim'
                }`}
              >
                {FREQUENCY_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {frequency === 'weekdays' && (
          <div>
            <label className="label">¿Qué días?</label>
            <div className="flex gap-1.5">
              {WEEKDAY_LETTERS.map((letter, i) => {
                const day = i + 1
                const on = weekdays.includes(day)
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`flex-1 aspect-square rounded-2xl font-bold text-sm transition-all active:scale-95 ${
                      on ? 'bg-bright text-void' : 'bg-raised text-dim'
                    }`}
                  >
                    {letter}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {(frequency === 'weekly' || frequency === 'monthly') && (
          <div>
            <label className="label">
              ¿Cuántas veces {frequency === 'weekly' ? 'por semana' : 'al mes'}?
            </label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setTargetCount((n) => Math.max(1, n - 1))}
                className="w-12 h-12 rounded-2xl bg-raised text-2xl font-bold active:scale-95 transition-transform"
                aria-label="Menos"
              >
                −
              </button>
              <span className="flex-1 text-center text-3xl font-bold num">{targetCount}</span>
              <button
                type="button"
                onClick={() => setTargetCount((n) => Math.min(maxTarget, n + 1))}
                className="w-12 h-12 rounded-2xl bg-raised text-2xl font-bold active:scale-95 transition-transform"
                aria-label="Más"
              >
                +
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-down">{error}</p>}

        <button className="btn-primary w-full" disabled={busy || !name.trim()}>
          {busy ? 'Guardando…' : habit ? 'Guardar cambios' : 'Crear hábito'}
        </button>
      </form>
    </div>
  )
}
