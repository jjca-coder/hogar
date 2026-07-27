import { format, subDays } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { frequencyText, habitStats, streakUnit } from './habits'
import type { Habit } from './types'

/** Lunes 27 de julio de 2026. */
const MONDAY = new Date(2026, 6, 27)

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    household_id: 'hh',
    owner_id: 'u1',
    name: 'Prueba',
    icon: 'sparkles',
    color: '#30D158',
    kind: 'do',
    unit: 'times',
    target_per_period: 1,
    frequency: 'daily',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    interval_days: 1,
    reminder_at: null,
    is_shared: false,
    archived: false,
    ...over,
  }
}

/**
 * Fechas de los últimos `days` días a partir del lunes de referencia.
 * Con `format` local, no con toISOString(): en Madrid este restaba un día.
 */
function lastDays(days: number[]): Set<string> {
  return new Set(days.map((d) => format(subDays(MONDAY, d), 'yyyy-MM-dd')))
}

describe('habitStats — diario', () => {
  it('cuenta los días seguidos', () => {
    const s = habitStats(habit(), lastDays([0, 1, 2, 3]), new Set(), MONDAY)
    expect(s.current).toBe(4)
    expect(s.doneToday).toBe(true)
  })

  it('no rompe la racha si hoy aún no se ha hecho', () => {
    // Hecho ayer y anteayer, hoy todavía no: la racha sigue viva
    const s = habitStats(habit(), lastDays([1, 2, 3]), new Set(), MONDAY)
    expect(s.current).toBe(3)
    expect(s.doneToday).toBe(false)
    expect(s.dueToday).toBe(true)
  })

  it('se corta con un hueco', () => {
    const s = habitStats(habit(), lastDays([0, 1, 3, 4]), new Set(), MONDAY)
    expect(s.current).toBe(2)
  })

  it('empieza en cero sin registros', () => {
    const s = habitStats(habit(), new Set(), new Set(), MONDAY)
    expect(s.current).toBe(0)
    expect(s.best).toBe(0)
    expect(s.rate30).toBe(0)
  })

  it('guarda la mejor racha aunque la actual sea peor', () => {
    // 5 seguidos hace tiempo, 1 ahora
    const s = habitStats(habit(), lastDays([0, 10, 11, 12, 13, 14]), new Set(), MONDAY)
    expect(s.current).toBe(1)
    expect(s.best).toBe(5)
  })

  it('un día de descanso no rompe la racha', () => {
    const entries = lastDays([0, 1, 3, 4])
    const rest = lastDays([2])
    const s = habitStats(habit(), entries, rest, MONDAY)
    expect(s.current).toBe(4)
  })

  it('calcula el cumplimiento a 30 días', () => {
    const s = habitStats(habit(), lastDays([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), new Set(), MONDAY)
    expect(s.rate30).toBeCloseTo(10 / 30, 5)
  })
})

describe('habitStats — días concretos', () => {
  const gym = habit({ frequency: 'weekdays', weekdays: [1, 3, 5] })

  it('solo cuenta los días que tocan', () => {
    // Lunes 27, viernes 24, miércoles 22, lunes 20
    const s = habitStats(gym, lastDays([0, 3, 5, 7]), new Set(), MONDAY)
    expect(s.current).toBe(4)
  })

  it('no penaliza los días que no tocaban', () => {
    // Solo lunes y miércoles; el martes que faltó no cuenta
    const s = habitStats(gym, lastDays([0, 5]), new Set(), MONDAY)
    expect(s.current).toBeGreaterThanOrEqual(1)
  })

  it('el cumplimiento solo mira los días objetivo', () => {
    const s = habitStats(gym, lastDays([0, 3, 5, 7, 10, 12, 14]), new Set(), MONDAY)
    // Hay ~13 días objetivo en 30 días con 3 por semana
    expect(s.rate30).toBeGreaterThan(0.4)
    expect(s.rate30).toBeLessThanOrEqual(1)
  })
})

describe('habitStats — veces por semana', () => {
  const running = habit({ frequency: 'times_per_week', target_per_period: 3 })

  it('cuenta lo hecho en la semana en curso', () => {
    const s = habitStats(running, lastDays([0]), new Set(), MONDAY)
    expect(s.doneThisPeriod).toBe(1)
    expect(s.target).toBe(3)
    expect(s.dueToday).toBe(true)
  })

  it('deja de pedirlo al llegar al objetivo', () => {
    // El lunes es el primer día de la semana: los tres son de esta semana
    const s = habitStats(running, lastDays([0]), new Set(), MONDAY)
    expect(s.dueToday).toBe(true)

    const week = new Set(['2026-07-27'])
    week.add('2026-07-28')
    week.add('2026-07-29')
    const done = habitStats(running, week, new Set(), new Date(2026, 6, 29))
    expect(done.doneThisPeriod).toBe(3)
    expect(done.dueToday).toBe(false)
  })

  it('la racha se mide en semanas', () => {
    // 3 por semana durante 3 semanas seguidas
    const s = habitStats(running, lastDays([0, 1, 2, 7, 8, 9, 14, 15, 16]), new Set(), MONDAY)
    expect(s.best).toBeGreaterThanOrEqual(2)
  })
})

describe('frequencyText', () => {
  it('describe cada frecuencia', () => {
    expect(frequencyText(habit())).toBe('Todos los días')
    expect(frequencyText(habit({ frequency: 'weekdays', weekdays: [1, 3, 5] }))).toBe('L·X·V')
    expect(frequencyText(habit({ frequency: 'times_per_week', target_per_period: 3 }))).toBe(
      '3×/semana',
    )
    expect(frequencyText(habit({ frequency: 'every_n_days', interval_days: 3 }))).toBe(
      'Cada 3 días',
    )
  })

  it('siete días concretos es lo mismo que diario', () => {
    expect(frequencyText(habit({ frequency: 'weekdays', weekdays: [1, 2, 3, 4, 5, 6, 7] }))).toBe(
      'Todos los días',
    )
  })
})

describe('streakUnit', () => {
  it('concuerda en singular y plural', () => {
    expect(streakUnit(habit(), 1)).toBe('día')
    expect(streakUnit(habit(), 5)).toBe('días')
    expect(streakUnit(habit({ frequency: 'times_per_week' }), 1)).toBe('semana')
    expect(streakUnit(habit({ frequency: 'times_per_week' }), 3)).toBe('semanas')
  })
})
