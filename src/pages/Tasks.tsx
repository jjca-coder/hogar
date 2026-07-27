import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { addDays, addMonths, format } from 'date-fns'
import { Check, Plus, Repeat, Trash2, X } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { shortDay, todayISO, initial } from '../lib/format'
import type { Recurrence, Task } from '../lib/types'

const recurrenceLabels: Record<Recurrence, string> = {
  none: 'No se repite',
  daily: 'Cada día',
  weekly: 'Cada semana',
  biweekly: 'Cada 2 semanas',
  monthly: 'Cada mes',
}

function nextDue(from: string, r: Recurrence): string {
  const d = new Date(from + 'T12:00:00')
  const next =
    r === 'daily' ? addDays(d, 1)
    : r === 'weekly' ? addDays(d, 7)
    : r === 'biweekly' ? addDays(d, 14)
    : addMonths(d, 1)
  return format(next, 'yyyy-MM-dd')
}

export default function Tasks() {
  const { household, members, session } = useApp()
  const uid = session!.user.id
  const [tasks, setTasks] = useState<Task[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const today = todayISO()

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  const load = async () => {
    if (!household) return
    const { data } = await sb()
      .from('tasks')
      .select('*')
      .eq('household_id', household.id)
      .order('due_date', { ascending: true, nullsFirst: false })
    setTasks((data as Task[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [household?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const pending = tasks.filter((t) => !t.done_at)
  const overdue = pending.filter((t) => t.due_date && t.due_date < today)
  const dueToday = pending.filter((t) => t.due_date === today)
  const upcoming = pending.filter((t) => t.due_date && t.due_date > today)
  const someday = pending.filter((t) => !t.due_date)
  const done = tasks
    .filter((t) => t.done_at)
    .sort((a, b) => (b.done_at! < a.done_at! ? -1 : 1))
    .slice(0, 10)

  const toggle = async (t: Task) => {
    if (t.done_at) {
      await sb().from('tasks').update({ done_at: null }).eq('id', t.id)
    } else {
      await sb().from('tasks').update({ done_at: new Date().toISOString() }).eq('id', t.id)
      if (t.recurrence !== 'none') {
        await sb().from('tasks').insert({
          household_id: household!.id,
          title: t.title,
          notes: t.notes,
          assigned_to: t.assigned_to,
          recurrence: t.recurrence,
          due_date: nextDue(t.due_date ?? today, t.recurrence),
        })
      }
    }
    load()
  }

  const remove = async (t: Task) => {
    if (!confirm(`¿Borrar "${t.title}"?`)) return
    await sb().from('tasks').delete().eq('id', t.id)
    load()
  }

  const TaskItem = ({ t }: { t: Task }) => {
    const assignee = t.assigned_to ? memberById.get(t.assigned_to) : null
    const isDone = Boolean(t.done_at)
    return (
      <div className="flex items-center gap-3 p-3.5">
        <button
          onClick={() => toggle(t)}
          className={`w-[22px] h-[22px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
            isDone ? 'bg-ink border-ink text-white' : 'border-stone-300 hover:border-ink'
          }`}
          aria-label={isDone ? 'Desmarcar' : 'Completar'}
        >
          {isDone && <Check size={13} strokeWidth={3.5} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-[15px] truncate ${isDone ? 'line-through text-stone-400' : ''}`}>
            {t.title}
          </p>
          {(t.due_date || t.recurrence !== 'none' || assignee) && (
            <p className="text-xs text-stone-400 flex items-center gap-1.5 mt-0.5">
              {t.due_date && (
                <span className={!isDone && t.due_date < today ? 'text-rose-500 font-semibold' : ''}>
                  {shortDay(t.due_date)}
                </span>
              )}
              {t.recurrence !== 'none' && <Repeat size={12} />}
              {assignee && (
                <span
                  className="inline-flex w-4 h-4 rounded-full text-white text-[10px] font-bold items-center justify-center"
                  style={{ backgroundColor: assignee.color }}
                  title={assignee.name}
                >
                  {initial(assignee.name)}
                </span>
              )}
            </p>
          )}
        </div>
        <button
          className="p-1.5 text-stone-300 hover:text-rose-500"
          onClick={() => remove(t)}
          aria-label="Borrar"
        >
          <Trash2 size={16} />
        </button>
      </div>
    )
  }

  const Section = ({ title, list, tone }: { title: string; list: Task[]; tone?: string }) =>
    list.length === 0 ? null : (
      <section>
        <h3 className={`section-title mb-2 ${tone ?? ''}`}>{title}</h3>
        <div className="card divide-y divide-stone-100">
          {list.map((t) => (
            <TaskItem key={t.id} t={t} />
          ))}
        </div>
      </section>
    )

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Tareas</h1>
        <p className="text-stone-500 text-sm mt-0.5">
          {pending.length === 0
            ? 'Todo al día'
            : `${pending.length} ${pending.length === 1 ? 'pendiente' : 'pendientes'}`}
        </p>
      </header>

      {pending.length === 0 && (
        <div className="card p-8 text-center text-stone-400">
          <p className="text-3xl mb-2">🧹</p>
          <p>Todo hecho. ¡A disfrutar!</p>
        </div>
      )}

      <Section title="Atrasadas" list={overdue} tone="!text-rose-500" />
      <Section title="Hoy" list={dueToday} tone="!text-ink" />
      <Section title="Próximas" list={upcoming} />
      <Section title="Algún día" list={someday} />
      <Section title="Hechas" list={done} />

      <button onClick={() => setShowAdd(true)} className="fab" aria-label="Nueva tarea">
        <Plus size={26} />
      </button>

      {showAdd && (
        <AddTask
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            load()
          }}
          uid={uid}
        />
      )}
    </div>
  )
}

function AddTask({ onClose, onSaved, uid }: { onClose: () => void; onSaved: () => void; uid: string }) {
  const { household, members } = useApp()
  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState<string>('')
  const [dueDate, setDueDate] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence>('none')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await sb().from('tasks').insert({
      household_id: household!.id,
      title: title.trim(),
      assigned_to: assignedTo || null,
      due_date: dueDate || null,
      recurrence,
    })
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="modal-sheet">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nueva tarea</h2>
          <button type="button" className="p-1.5 text-stone-400" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div>
          <label className="label">¿Qué hay que hacer?</label>
          <input
            className="input"
            placeholder="Poner la lavadora"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div>
          <label className="label">¿Quién?</label>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setAssignedTo('')}
              className={`chip !px-2 ${assignedTo === '' ? 'chip-active' : ''}`}
            >
              Cualquiera
            </button>
            {members.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => setAssignedTo(m.id)}
                className={`chip !px-2 truncate ${assignedTo === m.id ? 'chip-active' : ''}`}
              >
                {m.id === uid ? 'Yo' : m.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha límite</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Repetir</label>
            <select
              className="input"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
            >
              {Object.entries(recurrenceLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button className="btn-primary w-full" disabled={busy || !title.trim()}>
          {busy ? 'Guardando…' : 'Crear tarea'}
        </button>
      </form>
    </div>
  )
}
