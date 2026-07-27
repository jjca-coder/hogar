import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, isPast, isToday, isTomorrow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, Plus, Repeat, Sparkles, Trash2 } from 'lucide-react'
import {
  initials,
  nextOccurrence,
  parseTaskInput,
  rruleLabel,
  upperFirst,
  type Task,
  type TaskPriority,
} from '@aurora/shared'
import { sb, humanError } from '@/lib/supabase'
import { useActiveHousehold, usePermissions, useUserId } from '@/lib/session'
import {
  Card,
  Checkbox,
  EmptyState,
  InsetList,
  Segmented,
  Skeleton,
} from '@/design-system/primitives'

type View = 'today' | 'upcoming' | 'inbox' | 'done'

const PRIORITY_COLOR: Record<TaskPriority, string | null> = {
  none: null,
  low: 'var(--text-tertiary)',
  medium: 'var(--warning)',
  high: 'var(--expense)',
}

function dueLabel(date: string): { text: string; overdue: boolean } {
  const d = parseISO(date)
  if (isToday(d)) return { text: 'Hoy', overdue: false }
  if (isTomorrow(d)) return { text: 'Mañana', overdue: false }
  const overdue = isPast(d) && !isToday(d)
  return { text: upperFirst(format(d, "d 'de' LLL", { locale: es })), overdue }
}

export default function Tasks() {
  const { membership, all } = useActiveHousehold()
  const { canWriteTasks } = usePermissions()
  const myId = useUserId()
  const queryClient = useQueryClient()
  const householdId = membership?.household_id
  const [view, setView] = useState<View>('today')
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  const { data: tasks, isPending } = useQuery({
    queryKey: ['tasks', householdId],
    enabled: Boolean(householdId),
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await sb()
        .from('tasks')
        .select('*')
        .eq('household_id', householdId!)
        .is('parent_task_id', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as Task[]
    },
  })

  const create = useMutation({
    mutationFn: async (raw: string) => {
      const parsed = parseTaskInput(raw)
      const { error } = await sb().from('tasks').insert({
        household_id: householdId!,
        title: parsed.title,
        due_date: parsed.dueDate,
        due_time: parsed.dueTime,
        priority: parsed.priority,
        tags: parsed.tags,
        rrule: parsed.rrule,
      })
      if (error) throw error
      return parsed
    },
    onSuccess: () => {
      setInput('')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['tasks', householdId] })
    },
    onError: (e) => setError(humanError(e)),
  })

  const toggle = useMutation({
    mutationFn: async (task: Task) => {
      if (task.completed_at) {
        const { error } = await sb().from('tasks').update({ completed_at: null }).eq('id', task.id)
        if (error) throw error
        return
      }
      const { error } = await sb()
        .from('tasks')
        .update({ completed_at: new Date().toISOString(), completed_by: myId })
        .eq('id', task.id)
      if (error) throw error

      // Si se repite, se crea ya la siguiente para no perder el hilo
      if (task.rrule && task.due_date) {
        await sb()
          .from('tasks')
          .insert({
            household_id: householdId!,
            title: task.title,
            notes: task.notes,
            due_date: nextOccurrence(task.rrule, task.due_date),
            due_time: task.due_time,
            priority: task.priority,
            tags: task.tags,
            rrule: task.rrule,
            assigned_to: task.assigned_to,
            recurrence_parent_id: task.id,
          })
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', householdId] }),
    onError: (e) => setError(humanError(e)),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb().from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', householdId] }),
  })

  const list = useMemo(() => tasks ?? [], [tasks])
  const todayISO = format(new Date(), 'yyyy-MM-dd')

  const buckets = useMemo(() => {
    const pending = list.filter((t) => !t.completed_at)
    return {
      today: pending.filter((t) => t.due_date && t.due_date <= todayISO),
      upcoming: pending.filter((t) => t.due_date && t.due_date > todayISO),
      inbox: pending.filter((t) => !t.due_date),
      done: list
        .filter((t) => t.completed_at)
        .sort((a, b) => (b.completed_at! < a.completed_at! ? -1 : 1))
        .slice(0, 30),
    }
  }, [list, todayISO])

  const visible = buckets[view]
  const memberById = useMemo(() => new Map(all.map((m) => [m.household_id, m])), [all])
  void memberById // los avatares se resuelven con el perfil, no con la membresía

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || !canWriteTasks) return
    create.mutate(text)
  }

  // Vista previa de lo que se ha entendido mientras se escribe
  const preview = useMemo(() => (input.trim() ? parseTaskInput(input) : null), [input])

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <header>
        <h1 className="t-title-1">Tareas</h1>
        <p className="t-subhead text-[var(--text-tertiary)] mt-1">
          {buckets.today.length + buckets.inbox.length === 0
            ? 'Todo al día'
            : `${buckets.today.length} para hoy · ${buckets.inbox.length} sin fecha`}
        </p>
      </header>

      {canWriteTasks && (
        <form onSubmit={submit}>
          <div className="relative">
            <Plus
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
            />
            <input
              className="w-full pl-10 pr-3 py-3.5 rounded-[14px] t-body outline-none border"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--separator-opaque)',
              }}
              placeholder="Poner lavadora mañana a las 10 !alta #casa"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Nueva tarea"
            />
          </div>

          {preview &&
            (preview.dueDate ||
              preview.priority !== 'none' ||
              preview.tags.length > 0 ||
              preview.rrule) && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2 px-1">
                <Sparkles size={12} className="text-[var(--accent)]" />
                <span className="t-caption text-[var(--text-tertiary)]">He entendido:</span>
                <span className="t-caption font-medium">{preview.title}</span>
                {preview.dueDate && (
                  <Chip>
                    {upperFirst(format(parseISO(preview.dueDate), 'EEE d LLL', { locale: es }))}
                  </Chip>
                )}
                {preview.dueTime && <Chip>{preview.dueTime}</Chip>}
                {preview.priority !== 'none' && (
                  <Chip>
                    Prioridad{' '}
                    {preview.priority === 'high'
                      ? 'alta'
                      : preview.priority === 'medium'
                        ? 'media'
                        : 'baja'}
                  </Chip>
                )}
                {preview.rrule && <Chip>{rruleLabel(preview.rrule)}</Chip>}
                {preview.tags.map((t) => (
                  <Chip key={t}>#{t}</Chip>
                ))}
              </div>
            )}
        </form>
      )}

      {error && (
        <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
          {error}
        </p>
      )}

      <Segmented
        ariaLabel="Vista"
        value={view}
        onChange={setView}
        options={[
          { value: 'today', label: `Hoy${buckets.today.length ? ` ${buckets.today.length}` : ''}` },
          { value: 'upcoming', label: 'Próximas' },
          { value: 'inbox', label: 'Sin fecha' },
          { value: 'done', label: 'Hechas' },
        ]}
      />

      {isPending ? (
        <Card className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </Card>
      ) : visible.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<CheckCircle2 size={30} />}
            title={
              view === 'today'
                ? 'Nada pendiente hoy'
                : view === 'done'
                  ? 'Aún no has completado nada'
                  : 'Vacío'
            }
            description={
              view === 'today'
                ? 'Disfruta el día.'
                : 'Escribe arriba para añadir. Entiende cosas como «mañana a las 10».'
            }
          />
        </Card>
      ) : (
        <InsetList>
          {visible.map((task) => {
            const due = task.due_date ? dueLabel(task.due_date) : null
            const done = Boolean(task.completed_at)
            const priorityColor = PRIORITY_COLOR[task.priority]
            return (
              <div key={task.id} className="inset-row">
                <Checkbox
                  checked={done}
                  onChange={() => canWriteTasks && toggle.mutate(task)}
                  label={task.title}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`t-body truncate ${done ? 'line-through text-[var(--text-tertiary)]' : ''}`}
                  >
                    {task.title}
                  </p>
                  {(due || task.rrule || task.tags.length > 0) && (
                    <p className="t-footnote flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {due && (
                        <span
                          style={{
                            color: !done && due.overdue ? 'var(--expense)' : 'var(--text-tertiary)',
                            fontWeight: !done && due.overdue ? 600 : 400,
                          }}
                        >
                          {due.text}
                          {task.due_time ? ` · ${task.due_time.slice(0, 5)}` : ''}
                        </span>
                      )}
                      {task.rrule && <Repeat size={11} className="text-[var(--text-tertiary)]" />}
                      {task.tags.map((t) => (
                        <span key={t} className="text-[var(--text-tertiary)]">
                          #{t}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                {priorityColor && !done && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: priorityColor }}
                    title={`Prioridad ${task.priority}`}
                  />
                )}
                {task.assigned_to && (
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center t-caption-2 font-bold text-white shrink-0"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {initials(task.assigned_to.slice(0, 2))}
                  </span>
                )}
                {canWriteTasks && (
                  <button
                    onClick={() => remove.mutate(task.id)}
                    className="p-1 text-[var(--text-quaternary)] hover:text-[var(--expense)]"
                    aria-label="Borrar tarea"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            )
          })}
        </InsetList>
      )}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded-md t-caption-2 font-medium"
      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
    >
      {children}
    </span>
  )
}
