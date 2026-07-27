import { addDays, format, nextDay, startOfDay, type Day } from 'date-fns'

/**
 * Entrada de tareas en lenguaje natural.
 *
 * "Pagar el IBI el viernes a las 10 !alta #casa"
 *   -> título "Pagar el IBI", viernes que viene, 10:00, prioridad alta, etiqueta casa
 *
 * Se procesa de más específico a más genérico y siempre se retira del título
 * lo que se ha entendido, para que no quede texto duplicado.
 */

export interface ParsedTask {
  title: string
  dueDate: string | null
  dueTime: string | null
  priority: 'none' | 'low' | 'medium' | 'high'
  tags: string[]
  rrule: string | null
}

const WEEKDAYS: Record<string, Day> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
}

const MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/** `today` se inyecta para poder testear sin depender del reloj. */
export function parseTaskInput(input: string, today: Date = new Date()): ParsedTask {
  let text = ` ${input.trim()} `
  const base = startOfDay(today)

  let dueDate: string | null = null
  let dueTime: string | null = null
  let priority: ParsedTask['priority'] = 'none'
  let rrule: string | null = null
  const tags: string[] = []

  const consume = (pattern: RegExp) => {
    text = text.replace(pattern, ' ')
  }

  // --- Etiquetas: #casa ---
  for (const m of text.matchAll(/#([\p{L}\d_-]+)/gu)) {
    if (m[1]) tags.push(m[1].toLowerCase())
  }
  consume(/#[\p{L}\d_-]+/gu)

  // --- Prioridad: !alta / !media / !baja ---
  const priorityMatch = text.match(/!(alta|media|baja|high|medium|low)\b/i)
  if (priorityMatch?.[1]) {
    const p = priorityMatch[1].toLowerCase()
    priority =
      p === 'alta' || p === 'high' ? 'high' : p === 'media' || p === 'medium' ? 'medium' : 'low'
    consume(/!(alta|media|baja|high|medium|low)\b/i)
  }

  // --- Recurrencia: "cada día", "cada semana", "cada 2 semanas", "cada mes" ---
  const everyMatch = text.match(/\bcada\s+(?:(\d+)\s+)?(d[ií]as?|semanas?|meses|mes|a[ñn]os?)\b/i)
  if (everyMatch) {
    const n = everyMatch[1] ? Number(everyMatch[1]) : 1
    const unit = everyMatch[2]!.toLowerCase()
    const freq = unit.startsWith('d')
      ? 'DAILY'
      : unit.startsWith('sem')
        ? 'WEEKLY'
        : unit.startsWith('a')
          ? 'YEARLY'
          : 'MONTHLY'
    rrule = n > 1 ? `FREQ=${freq};INTERVAL=${n}` : `FREQ=${freq}`
    consume(/\bcada\s+(?:\d+\s+)?(d[ií]as?|semanas?|meses|mes|a[ñn]os?)\b/i)
  }

  // --- Hora: "a las 10", "a las 10:30", "10h" ---
  const timeMatch = text.match(/\b(?:a\s+las\s+)?(\d{1,2})(?::(\d{2}))?\s*(h|horas)?\b(?=\s)/i)
  if (timeMatch && (timeMatch[0].includes('las') || timeMatch[3] || timeMatch[2])) {
    const h = Number(timeMatch[1])
    const min = timeMatch[2] ? Number(timeMatch[2]) : 0
    if (h < 24 && min < 60) {
      dueTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
      text = text.replace(timeMatch[0], ' ')
    }
  }

  // --- Fechas relativas ---
  // "pasado mañana" va ANTES que "mañana": si no, la segunda se lo come.
  if (/\bpasado\s+ma[ñn]ana\b/i.test(text)) {
    dueDate = iso(addDays(base, 2))
    consume(/\bpasado\s+ma[ñn]ana\b/i)
  } else if (/\bhoy\b/i.test(text)) {
    dueDate = iso(base)
    consume(/\bhoy\b/i)
  } else if (/\bma[ñn]ana\b/i.test(text)) {
    dueDate = iso(addDays(base, 1))
    consume(/\bma[ñn]ana\b/i)
  } else {
    // --- Día de la semana: "el viernes", "próximo lunes" ---
    const dayMatch = text.match(
      /\b(?:el\s+|pr[oó]ximo\s+|siguiente\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i,
    )
    if (dayMatch?.[1]) {
      const key = dayMatch[1].toLowerCase()
      const target = WEEKDAYS[key]
      if (target !== undefined) {
        dueDate = iso(nextDay(base, target))
        text = text.replace(dayMatch[0], ' ')
      }
    } else {
      // --- Fecha explícita: "el 15 de agosto", "15/08" ---
      const longDate = text.match(/\b(?:el\s+)?(\d{1,2})\s+de\s+([a-záéíóú]+)\b/i)
      if (longDate?.[1] && longDate[2]) {
        const month = MONTHS[longDate[2].toLowerCase()]
        if (month !== undefined) {
          const day = Number(longDate[1])
          const year = base.getFullYear()
          const candidate = new Date(year, month, day)
          // Si ya pasó, se entiende que es del año que viene
          dueDate = iso(candidate < base ? new Date(year + 1, month, day) : candidate)
          text = text.replace(longDate[0], ' ')
        }
      } else {
        const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
        if (numeric?.[1] && numeric[2]) {
          const day = Number(numeric[1])
          const month = Number(numeric[2]) - 1
          const year = numeric[3]
            ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
            : base.getFullYear()
          if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
            const candidate = new Date(year, month, day)
            dueDate = iso(
              !numeric[3] && candidate < base ? new Date(year + 1, month, day) : candidate,
            )
            text = text.replace(numeric[0], ' ')
          }
        }
      }
    }
  }

  // Limpieza: preposiciones sueltas que quedan al quitar la fecha
  const title = text
    .replace(/\s+(el|la|los|las|a|de|del|para)\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    title: title || input.trim(),
    dueDate,
    dueTime,
    priority,
    tags,
    rrule,
  }
}

/** Siguiente fecha de una recurrencia sencilla, a partir de una RRULE básica. */
export function nextOccurrence(rrule: string, from: string): string {
  const freq = rrule.match(/FREQ=(\w+)/)?.[1] ?? 'DAILY'
  const interval = Number(rrule.match(/INTERVAL=(\d+)/)?.[1] ?? 1)
  const date = new Date(from + 'T12:00:00')

  switch (freq) {
    case 'WEEKLY':
      return iso(addDays(date, 7 * interval))
    case 'MONTHLY': {
      const d = new Date(date)
      d.setMonth(d.getMonth() + interval)
      return iso(d)
    }
    case 'YEARLY': {
      const d = new Date(date)
      d.setFullYear(d.getFullYear() + interval)
      return iso(d)
    }
    default:
      return iso(addDays(date, interval))
  }
}

export const RRULE_LABELS: Array<{ value: string | null; label: string }> = [
  { value: null, label: 'No se repite' },
  { value: 'FREQ=DAILY', label: 'Cada día' },
  { value: 'FREQ=WEEKLY', label: 'Cada semana' },
  { value: 'FREQ=WEEKLY;INTERVAL=2', label: 'Cada 2 semanas' },
  { value: 'FREQ=MONTHLY', label: 'Cada mes' },
  { value: 'FREQ=YEARLY', label: 'Cada año' },
]

export function rruleLabel(rrule: string | null): string {
  return RRULE_LABELS.find((r) => r.value === rrule)?.label ?? 'Se repite'
}
