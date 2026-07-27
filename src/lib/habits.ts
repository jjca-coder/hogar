import {
  endOfMonth,
  endOfWeek,
  format,
  getISODay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import type { Frequency, Habit } from './types'

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const WEEK_OPTS = { weekStartsOn: 1 as const }

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Todos los días',
  weekdays: 'Días concretos',
  weekly: 'Veces por semana',
  monthly: 'Veces al mes',
}

export const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Texto corto para la tarjeta: "Todos los días", "L·X·V", "3 veces/semana". */
export function frequencyText(h: Habit): string {
  if (h.frequency === 'daily') return 'Todos los días'
  if (h.frequency === 'weekdays') {
    const days = [...(h.weekdays ?? [])].sort((a, b) => a - b)
    if (days.length === 7) return 'Todos los días'
    return days.map((d) => WEEKDAY_LETTERS[d - 1]).join(' · ')
  }
  const n = h.target_count ?? 1
  const unit = h.frequency === 'weekly' ? 'sem.' : 'mes'
  return `${n}×/${unit}`
}

/** ¿Toca hoy? Para weekly/monthly toca mientras no se haya alcanzado el objetivo. */
export function isDueToday(h: Habit, doneThisPeriod: number): boolean {
  if (h.frequency === 'daily') return true
  if (h.frequency === 'weekdays') return (h.weekdays ?? []).includes(getISODay(new Date()))
  return doneThisPeriod < (h.target_count ?? 1)
}

/** Marcas dentro del periodo actual (semana o mes), para el contador "2 de 3". */
export function doneInCurrentPeriod(h: Habit, dates: Set<string>): number {
  const now = new Date()
  const [from, to] =
    h.frequency === 'monthly'
      ? [startOfMonth(now), endOfMonth(now)]
      : [startOfWeek(now, WEEK_OPTS), endOfWeek(now, WEEK_OPTS)]
  let n = 0
  for (const d of dates) {
    if (d >= iso(from) && d <= iso(to)) n++
  }
  return n
}

function countBetween(dates: Set<string>, from: Date, to: Date): number {
  let n = 0
  for (const d of dates) if (d >= iso(from) && d <= iso(to)) n++
  return n
}

/**
 * Racha en la unidad que corresponde a la frecuencia:
 * días para daily/weekdays, semanas para weekly, meses para monthly.
 * El periodo en curso no rompe la racha si aún da tiempo a cumplirlo.
 */
export function streak(h: Habit, dates: Set<string>): number {
  const target = h.target_count ?? 1

  if (h.frequency === 'weekly' || h.frequency === 'monthly') {
    const monthly = h.frequency === 'monthly'
    let n = 0
    for (let i = 0; i < 260; i++) {
      const ref = monthly ? subMonths(new Date(), i) : subWeeks(new Date(), i)
      const [from, to] = monthly
        ? [startOfMonth(ref), endOfMonth(ref)]
        : [startOfWeek(ref, WEEK_OPTS), endOfWeek(ref, WEEK_OPTS)]
      const hit = countBetween(dates, from, to) >= target
      if (hit) n++
      else if (i > 0) break // el periodo en curso aún puede completarse
    }
    return n
  }

  // daily / weekdays: contamos hacia atrás solo los días que tocaban
  const targets = h.frequency === 'weekdays' ? (h.weekdays ?? []) : [1, 2, 3, 4, 5, 6, 7]
  if (targets.length === 0) return 0

  let n = 0
  let d = new Date()
  // Si hoy tocaba y aún no está marcado, no rompe: se empieza a contar desde ayer
  if (targets.includes(getISODay(d)) && !dates.has(iso(d))) d = subDays(d, 1)

  for (let i = 0; i < 400; i++) {
    if (targets.includes(getISODay(d))) {
      if (!dates.has(iso(d))) break
      n++
    }
    d = subDays(d, 1)
  }
  return n
}

/** Unidad de la racha, para escribir "4 días" / "3 semanas" / "2 meses". */
export function streakUnit(h: Habit, n: number): string {
  if (h.frequency === 'weekly') return n === 1 ? 'semana seguida' : 'semanas seguidas'
  if (h.frequency === 'monthly') return n === 1 ? 'mes seguido' : 'meses seguidos'
  return n === 1 ? 'día seguido' : 'días seguidos'
}
