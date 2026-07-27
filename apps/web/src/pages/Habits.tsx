import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, startOfWeek, subDays } from 'date-fns'
import { Flame, Plus, Trash2 } from 'lucide-react'
import {
  FREQUENCY_LABELS,
  WEEKDAY_LETTERS,
  frequencyText,
  habitStats,
  streakUnit,
  type Habit,
  type HabitFrequency,
} from '@aurora/shared'
import { sb, humanError } from '@/lib/supabase'
import { useActiveHousehold, useUserId } from '@/lib/session'
import { Button, Card, EmptyState, Sheet, Skeleton, Switch } from '@/design-system/primitives'

const ICONS = [
  '💪',
  '🏃',
  '🧘',
  '📚',
  '💧',
  '🥗',
  '😴',
  '🦷',
  '🚭',
  '💊',
  '🎸',
  '✍️',
  '🧹',
  '🌱',
  '🙏',
  '☀️',
]

interface Entry {
  habit_id: string
  entry_date: string
}

export default function Habits() {
  const { membership } = useActiveHousehold()
  const myId = useUserId()
  const queryClient = useQueryClient()
  const householdId = membership?.household_id
  const [editing, setEditing] = useState<Habit | null>(null)
  const [creating, setCreating] = useState(false)

  const { data, isPending } = useQuery({
    queryKey: ['habits', householdId],
    enabled: Boolean(householdId),
    queryFn: async () => {
      const { data: habits, error } = await sb()
        .from('habits')
        .select('*')
        .eq('household_id', householdId!)
        .eq('archived', false)
        .order('position')
      if (error) throw error

      const list = (habits ?? []) as Habit[]
      if (list.length === 0) return { habits: list, entries: [] as Entry[] }

      // Un año de historial: suficiente para el heatmap y la mejor racha
      const since = format(subDays(new Date(), 365), 'yyyy-MM-dd')
      const { data: entries } = await sb()
        .from('habit_entries')
        .select('habit_id, entry_date')
        .in(
          'habit_id',
          list.map((h) => h.id),
        )
        .gte('entry_date', since)

      return { habits: list, entries: (entries ?? []) as Entry[] }
    },
  })

  const toggle = useMutation({
    mutationFn: async ({ habit, date }: { habit: Habit; date: string }) => {
      const has = entriesByHabit.get(habit.id)?.has(date)
      if (has) {
        const { error } = await sb()
          .from('habit_entries')
          .delete()
          .eq('habit_id', habit.id)
          .eq('entry_date', date)
        if (error) throw error
      } else {
        const { error } = await sb()
          .from('habit_entries')
          .insert({ habit_id: habit.id, entry_date: date, value: 1 })
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['habits', householdId] }),
  })

  const entriesByHabit = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const e of data?.entries ?? []) {
      if (!map.has(e.habit_id)) map.set(e.habit_id, new Set())
      map.get(e.habit_id)!.add(e.entry_date)
    }
    return map
  }, [data])

  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'))
  }, [])

  const todayISO = format(new Date(), 'yyyy-MM-dd')
  const habits = data?.habits ?? []
  const mine = habits.filter((h) => h.owner_id === myId)
  const shared = habits.filter((h) => h.owner_id !== myId && h.is_shared)

  const renderHabit = (habit: Habit, editable: boolean) => {
    const entries = entriesByHabit.get(habit.id) ?? new Set<string>()
    const stats = habitStats(habit, entries)
    const periodic = habit.frequency === 'times_per_week'

    return (
      <Card key={habit.id}>
        <div className="flex items-center gap-3 mb-4">
          <button
            className="w-11 h-11 rounded-[14px] flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${habit.color} 16%, transparent)` }}
            onClick={() => editable && setEditing(habit)}
            disabled={!editable}
            aria-label={editable ? `Editar ${habit.name}` : habit.name}
          >
            {habit.icon}
          </button>
          <div className="flex-1 min-w-0">
            <p className="t-body font-medium truncate">{habit.name}</p>
            <p className="t-footnote flex items-center gap-1.5 mt-0.5">
              <Flame
                size={11}
                style={{ color: stats.current > 0 ? '#FF9F0A' : 'var(--text-quaternary)' }}
              />
              <span className="text-[var(--text-tertiary)] whitespace-nowrap">
                {stats.current > 0
                  ? `${stats.current} ${streakUnit(habit, stats.current)}`
                  : 'Sin racha'}
              </span>
              <span className="text-[var(--text-quaternary)]">·</span>
              <span className="text-[var(--text-tertiary)] truncate">{frequencyText(habit)}</span>
            </p>
          </div>
          {stats.best > 0 && (
            <div className="text-right shrink-0">
              <p className="t-caption-2 text-[var(--text-quaternary)]">Récord</p>
              <p className="t-footnote font-semibold num">{stats.best}</p>
            </div>
          )}
        </div>

        {periodic && (
          <div className="mb-3.5">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="t-caption text-[var(--text-tertiary)]">Esta semana</span>
              <span className="t-caption font-bold num">
                {stats.doneThisPeriod}
                <span className="text-[var(--text-tertiary)]"> de {stats.target}</span>
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-inset)' }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.min((stats.doneThisPeriod / stats.target) * 100, 100)}%`,
                  backgroundColor:
                    stats.doneThisPeriod >= stats.target ? 'var(--income)' : habit.color,
                }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-between gap-1.5">
          {weekDays.map((day, i) => {
            const done = entries.has(day)
            const future = day > todayISO
            const isToday = day === todayISO
            const offDay = habit.frequency === 'weekdays' && !(habit.weekdays ?? []).includes(i + 1)
            return (
              <button
                key={day}
                onClick={() => editable && !future && toggle.mutate({ habit, date: day })}
                disabled={!editable || future}
                className="flex-1 flex flex-col items-center gap-1.5 py-0.5 transition-transform active:scale-95 disabled:active:scale-100"
                aria-label={`${WEEKDAY_LETTERS[i]} ${done ? 'hecho' : 'no hecho'}`}
              >
                <span
                  className="t-caption-2 font-bold"
                  style={{ color: isToday ? 'var(--text-primary)' : 'var(--text-quaternary)' }}
                >
                  {WEEKDAY_LETTERS[i]}
                </span>
                <span
                  className="w-full aspect-square max-w-[36px] rounded-[10px] transition-colors"
                  style={{
                    backgroundColor: done
                      ? habit.color
                      : future || offDay
                        ? 'color-mix(in srgb, var(--bg-inset) 50%, transparent)'
                        : 'var(--bg-inset)',
                    border: isToday && !done ? '1.5px solid var(--text-quaternary)' : undefined,
                  }}
                />
              </button>
            )
          })}
        </div>

        <YearHeatmap entries={entries} color={habit.color} />

        <p className="t-caption text-[var(--text-tertiary)] text-center mt-3">
          {Math.round(stats.rate30 * 100)}% de cumplimiento en 30 días
        </p>
      </Card>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="t-title-1">Hábitos</h1>
          <p className="t-subhead text-[var(--text-tertiary)] mt-1">
            Toca cualquier día para marcarlo
          </p>
        </div>
        <Button size="sm" variant="tinted" onClick={() => setCreating(true)}>
          <Plus size={15} /> Nuevo
        </Button>
      </header>

      {isPending ? (
        <Card className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </Card>
      ) : mine.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Flame size={30} />}
            title="Sin hábitos todavía"
            description="Empieza por uno solo. Los que funcionan son los pequeños y concretos."
            action={<Button onClick={() => setCreating(true)}>Crear el primero</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-3">{mine.map((h) => renderHabit(h, true))}</div>
      )}

      {shared.length > 0 && (
        <section className="space-y-3">
          <h2 className="t-footnote uppercase tracking-wider font-semibold text-[var(--text-tertiary)] px-1">
            Compartidos por tu hogar
          </h2>
          {shared.map((h) => renderHabit(h, false))}
        </section>
      )}

      {(creating || editing) && (
        <HabitSheet
          habit={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            queryClient.invalidateQueries({ queryKey: ['habits', householdId] })
          }}
        />
      )}
    </div>
  )
}

/** Heatmap tipo GitHub de las últimas ~17 semanas. */
function YearHeatmap({ entries, color }: { entries: ReadonlySet<string>; color: string }) {
  const weeks = 17
  const cells = useMemo(() => {
    const end = startOfWeek(new Date(), { weekStartsOn: 1 })
    const out: Array<Array<{ date: string; done: boolean }>> = []
    for (let w = weeks - 1; w >= 0; w--) {
      const weekStart = subDays(end, w * 7)
      const column = []
      for (let d = 0; d < 7; d++) {
        const date = format(addDays(weekStart, d), 'yyyy-MM-dd')
        column.push({ date, done: entries.has(date) })
      }
      out.push(column)
    }
    return out
  }, [entries])

  return (
    <div className="flex gap-[3px] mt-4 overflow-hidden" aria-hidden>
      {cells.map((column, i) => (
        <div key={i} className="flex flex-col gap-[3px] flex-1">
          {column.map((cell) => (
            <span
              key={cell.date}
              className="w-full aspect-square rounded-[2px]"
              style={{
                backgroundColor: cell.done ? color : 'var(--bg-inset)',
                opacity: cell.done ? 1 : 0.6,
              }}
            />
          ))}
        </div>
      ))}
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
  const { membership } = useActiveHousehold()
  const myId = useUserId()
  const [name, setName] = useState(habit?.name ?? '')
  const [icon, setIcon] = useState(habit?.icon ?? '💪')
  const [frequency, setFrequency] = useState<HabitFrequency>(habit?.frequency ?? 'daily')
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? [1, 3, 5])
  const [times, setTimes] = useState(habit?.target_per_period ?? 3)
  const [intervalDays, setIntervalDays] = useState(habit?.interval_days ?? 2)
  const [isShared, setIsShared] = useState(habit?.is_shared ?? false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) {
      setError('Ponle un nombre')
      return
    }
    if (frequency === 'weekdays' && weekdays.length === 0) {
      setError('Elige al menos un día')
      return
    }
    setBusy(true)
    const payload = {
      name: name.trim(),
      icon,
      color: habit?.color ?? '#30D158',
      frequency,
      weekdays: frequency === 'weekdays' ? weekdays : [1, 2, 3, 4, 5, 6, 7],
      target_per_period: frequency === 'times_per_week' ? times : 1,
      interval_days: frequency === 'every_n_days' ? intervalDays : 1,
      is_shared: isShared,
    }
    const { error } = habit
      ? await sb().from('habits').update(payload).eq('id', habit.id)
      : await sb()
          .from('habits')
          .insert({ ...payload, household_id: membership!.household_id, owner_id: myId! })
    setBusy(false)
    if (error) setError(humanError(error))
    else onSaved()
  }

  const del = async () => {
    if (!habit) return
    if (!confirm(`¿Borrar "${habit.name}" y todo su historial?`)) return
    const { error } = await sb().from('habits').delete().eq('id', habit.id)
    if (error) setError(humanError(error))
    else onSaved()
  }

  const inputStyle = { backgroundColor: 'var(--bg-inset)', borderColor: 'transparent' }

  return (
    <Sheet open onClose={onClose} title={habit ? 'Editar hábito' : 'Nuevo hábito'}>
      <div className="space-y-5">
        <input
          className="w-full px-4 py-3.5 rounded-[14px] t-body outline-none border"
          style={inputStyle}
          placeholder="Ir al gimnasio"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={!habit}
        />

        <div>
          <p className="t-subhead font-medium mb-2">Icono</p>
          <div className="grid grid-cols-8 gap-2">
            {ICONS.map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className="aspect-square rounded-[12px] text-xl flex items-center justify-center transition-all"
                style={{
                  backgroundColor: 'var(--bg-inset)',
                  outline: icon === i ? '2px solid var(--accent)' : 'none',
                  outlineOffset: '1px',
                }}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="t-subhead font-medium mb-2">¿Cada cuánto?</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(FREQUENCY_LABELS) as HabitFrequency[]).map((f) => (
              <button
                key={f}
                onClick={() => setFrequency(f)}
                className="px-3 py-2.5 rounded-[12px] border t-footnote font-medium transition-colors"
                style={{
                  borderColor: frequency === f ? 'var(--accent)' : 'var(--separator-opaque)',
                  backgroundColor: frequency === f ? 'var(--accent-soft)' : 'transparent',
                  color: frequency === f ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {FREQUENCY_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {frequency === 'weekdays' && (
          <div>
            <p className="t-subhead font-medium mb-2">¿Qué días?</p>
            <div className="flex gap-1.5">
              {WEEKDAY_LETTERS.map((letter, i) => {
                const day = i + 1
                const on = weekdays.includes(day)
                return (
                  <button
                    key={day}
                    onClick={() =>
                      setWeekdays((prev) =>
                        prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
                      )
                    }
                    className="flex-1 aspect-square rounded-[12px] font-bold t-subhead transition-all active:scale-95"
                    style={{
                      backgroundColor: on ? 'var(--accent)' : 'var(--bg-inset)',
                      color: on ? 'var(--text-on-accent)' : 'var(--text-tertiary)',
                    }}
                  >
                    {letter}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {frequency === 'times_per_week' && (
          <Stepper label="Veces por semana" value={times} onChange={setTimes} min={1} max={7} />
        )}

        {frequency === 'every_n_days' && (
          <Stepper
            label="Cada cuántos días"
            value={intervalDays}
            onChange={setIntervalDays}
            min={2}
            max={90}
          />
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="t-body">Compartir con el hogar</p>
            <p className="t-footnote text-[var(--text-tertiary)]">Para animaros mutuamente</p>
          </div>
          <Switch checked={isShared} onChange={setIsShared} label="Compartir" />
        </div>

        {error && (
          <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
            {error}
          </p>
        )}

        <Button size="lg" fullWidth loading={busy} onClick={save}>
          {habit ? 'Guardar cambios' : 'Crear hábito'}
        </Button>

        {habit && (
          <Button variant="destructive" fullWidth onClick={del}>
            <Trash2 size={16} /> Borrar hábito
          </Button>
        )}
      </div>
    </Sheet>
  )
}

function Stepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
}) {
  return (
    <div>
      <p className="t-subhead font-medium mb-2">{label}</p>
      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-12 h-12 rounded-[14px] text-2xl font-bold active:scale-95 transition-transform"
          style={{ backgroundColor: 'var(--bg-inset)' }}
          aria-label="Menos"
        >
          −
        </button>
        <span className="flex-1 text-center t-title-1 num">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-12 h-12 rounded-[14px] text-2xl font-bold active:scale-95 transition-transform"
          style={{ backgroundColor: 'var(--bg-inset)' }}
          aria-label="Más"
        >
          +
        </button>
      </div>
    </div>
  )
}
