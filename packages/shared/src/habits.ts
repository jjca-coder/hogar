import {
  differenceInCalendarDays,
  endOfWeek,
  format,
  getISODay,
  parseISO,
  startOfWeek,
  subDays,
} from 'date-fns'
import type { Habit, HabitFrequency } from './types'

const WEEK = { weekStartsOn: 1 } as const
const iso = (d: Date) => format(d, 'yyyy-MM-dd')

export interface HabitStats {
  /** Racha en curso, en la unidad de la frecuencia (días o semanas). */
  current: number
  /** Mejor racha histórica. */
  best: number
  /** Cumplimiento en los últimos 30 días, de 0 a 1. */
  rate30: number
  /** Veces hechas en el periodo actual (para "2 de 3 esta semana"). */
  doneThisPeriod: number
  /** Objetivo del periodo actual. */
  target: number
  /** ¿Toca hoy? */
  dueToday: boolean
  /** ¿Ya está hecho hoy? */
  doneToday: boolean
}

/** ¿Ese día entra en el plan del hábito? */
export function isTargetDay(habit: Habit, date: Date): boolean {
  switch (habit.frequency) {
    case 'daily':
      return true
    case 'weekdays':
      return (habit.weekdays ?? []).includes(getISODay(date))
    case 'every_n_days':
      return true // se decide por distancia al último hecho, no por el día
    case 'times_per_week':
      return true // cualquier día vale mientras no se llegue al objetivo
    default:
      return true
  }
}

function targetPerPeriod(habit: Habit): number {
  if (habit.frequency === 'times_per_week') return Math.max(habit.target_per_period, 1)
  return 1
}

/**
 * Estadísticas de un hábito.
 *
 * `entries` son las fechas (YYYY-MM-DD) en que se registró, y `restDays` los
 * descansos planificados, que ni cuentan como hechos ni rompen la racha:
 * es lo que separa una app que ayuda de una que castiga.
 */
export function habitStats(
  habit: Habit,
  entries: ReadonlySet<string>,
  restDays: ReadonlySet<string> = new Set(),
  today: Date = new Date(),
): HabitStats {
  const todayISO = iso(today)
  const doneToday = entries.has(todayISO)
  const target = targetPerPeriod(habit)

  // ---- Periodo actual ----
  let doneThisPeriod = 0
  if (habit.frequency === 'times_per_week') {
    const from = iso(startOfWeek(today, WEEK))
    const to = iso(endOfWeek(today, WEEK))
    for (const d of entries) if (d >= from && d <= to) doneThisPeriod++
  } else {
    doneThisPeriod = doneToday ? 1 : 0
  }

  // ---- ¿Toca hoy? ----
  let dueToday: boolean
  if (habit.frequency === 'times_per_week') {
    dueToday = doneThisPeriod < target
  } else if (habit.frequency === 'every_n_days') {
    const last = [...entries].sort().pop()
    dueToday = !last || differenceInCalendarDays(today, parseISO(last)) >= habit.interval_days
  } else {
    dueToday = isTargetDay(habit, today) && !doneToday
  }

  // ---- Rachas ----
  const { current, best } = computeStreaks(habit, entries, restDays, today, target)

  // ---- Cumplimiento a 30 días ----
  let opportunities = 0
  let hits = 0
  for (let i = 0; i < 30; i++) {
    const day = subDays(today, i)
    const key = iso(day)
    if (restDays.has(key)) continue
    if (habit.frequency === 'weekdays' && !isTargetDay(habit, day)) continue
    opportunities++
    if (entries.has(key)) hits++
  }

  return {
    current,
    best,
    rate30: opportunities > 0 ? hits / opportunities : 0,
    doneThisPeriod,
    target,
    dueToday,
    doneToday,
  }
}

function computeStreaks(
  habit: Habit,
  entries: ReadonlySet<string>,
  restDays: ReadonlySet<string>,
  today: Date,
  target: number,
): { current: number; best: number } {
  if (entries.size === 0) return { current: 0, best: 0 }

  // Semanal: se cuentan semanas que cumplieron el objetivo
  if (habit.frequency === 'times_per_week') {
    let current = 0
    let best = 0
    let running = 0
    for (let w = 0; w < 104; w++) {
      const ref = subDays(today, w * 7)
      const from = iso(startOfWeek(ref, WEEK))
      const to = iso(endOfWeek(ref, WEEK))
      let count = 0
      for (const d of entries) if (d >= from && d <= to) count++

      const achieved = count >= target
      if (achieved) {
        running++
        best = Math.max(best, running)
        if (w === current) current = running
      } else if (w === 0) {
        // La semana en curso aún puede completarse: no rompe la racha
        continue
      } else {
        running = 0
      }
    }
    return { current, best }
  }

  // Diario / días concretos / cada N días: se cuentan días objetivo consecutivos
  const targets = (d: Date) => isTargetDay(habit, d)
  const step = habit.frequency === 'every_n_days' ? Math.max(habit.interval_days, 1) : 1

  let current = 0
  let cursor = new Date(today)
  // Si hoy tocaba y aún no está hecho, la racha se mide desde ayer
  if (targets(cursor) && !entries.has(iso(cursor))) cursor = subDays(cursor, step)

  for (let i = 0; i < 730; i++) {
    const key = iso(cursor)
    if (restDays.has(key)) {
      cursor = subDays(cursor, step)
      continue
    }
    if (targets(cursor)) {
      if (!entries.has(key)) break
      current++
    }
    cursor = subDays(cursor, step)
  }

  // Mejor racha: se recorre todo el histórico
  const sorted = [...entries].sort()
  let best = 0
  let running = 0
  let previous: Date | null = null
  for (const key of sorted) {
    const day = parseISO(key)
    if (previous) {
      let gapOk = true
      let probe = subDays(day, step)
      // Entre dos registros solo puede haber días que no tocaban o descansos
      while (probe > previous) {
        const probeKey = iso(probe)
        if (targets(probe) && !restDays.has(probeKey) && !entries.has(probeKey)) {
          gapOk = false
          break
        }
        probe = subDays(probe, 1)
      }
      running = gapOk ? running + 1 : 1
    } else {
      running = 1
    }
    best = Math.max(best, running)
    previous = day
  }

  return { current, best: Math.max(best, current) }
}

export const FREQUENCY_LABELS: Record<HabitFrequency, string> = {
  daily: 'Todos los días',
  weekdays: 'Días concretos',
  times_per_week: 'Veces por semana',
  every_n_days: 'Cada X días',
}

export const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

/** Texto corto para la tarjeta: "L·X·V", "3×/semana", "cada 3 días". */
export function frequencyText(habit: Habit): string {
  switch (habit.frequency) {
    case 'daily':
      return 'Todos los días'
    case 'weekdays': {
      const days = [...(habit.weekdays ?? [])].sort((a, b) => a - b)
      if (days.length === 7) return 'Todos los días'
      return days.map((d) => WEEKDAY_LETTERS[d - 1]).join('·')
    }
    case 'times_per_week': {
      const n = habit.target_per_period
      return `${n}×/semana`
    }
    case 'every_n_days':
      return habit.interval_days === 1 ? 'Todos los días' : `Cada ${habit.interval_days} días`
  }
}

/** Unidad de la racha, para redactar "4 días" o "3 semanas". */
export function streakUnit(habit: Habit, n: number): string {
  if (habit.frequency === 'times_per_week') return n === 1 ? 'semana' : 'semanas'
  return n === 1 ? 'día' : 'días'
}
