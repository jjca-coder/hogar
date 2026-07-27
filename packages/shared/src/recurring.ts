import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

/** Días típicos de cada cadencia y tolerancia admitida. */
const CADENCES: Array<{ cadence: Cadence; days: number; tolerance: number }> = [
  { cadence: 'weekly', days: 7, tolerance: 2 },
  { cadence: 'biweekly', days: 14, tolerance: 3 },
  { cadence: 'monthly', days: 30, tolerance: 5 },
  { cadence: 'quarterly', days: 91, tolerance: 10 },
  { cadence: 'yearly', days: 365, tolerance: 20 },
]

export interface CandidateTransaction {
  id: string
  /** Descripción ya limpia; se normaliza aquí para agrupar. */
  description: string
  /** Unidades mínimas, negativo en gastos. */
  amount: number
  /** YYYY-MM-DD */
  date: string
  category_id: string | null
}

export interface DetectedRecurring {
  key: string
  name: string
  category_id: string | null
  cadence: Cadence
  /** Media de los importes observados, en unidades mínimas (positivo). */
  averageAmount: number
  occurrences: number
  lastSeen: string
  nextExpected: string
  /** Coste al año a la cadencia detectada. */
  yearlyCost: number
  /** El último importe subió más de un 5% respecto a la media anterior. */
  priceIncreased: boolean
  transactionIds: string[]
}

/**
 * Normaliza el literal del banco para poder agrupar:
 * quita ruido típico (COMPRA TARJ, números de terminal, fechas, ciudades cortas).
 */
export function normalizeMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(compra|tarj(eta)?|pago|recibo|adeudo|domiciliacion|en|de|del|la|el)\b/g, ' ')
    .replace(/\d{2}[/-]\d{2}([/-]\d{2,4})?/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function medianGap(dates: string[]): number {
  const sorted = [...dates].sort()
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(differenceInCalendarDays(parseISO(sorted[i]!), parseISO(sorted[i - 1]!)))
  }
  if (gaps.length === 0) return 0
  gaps.sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  return gaps.length % 2 === 0
    ? Math.round(((gaps[mid - 1] ?? 0) + (gaps[mid] ?? 0)) / 2)
    : (gaps[mid] ?? 0)
}

/**
 * Suma días a una fecha de calendario.
 * Con `toISOString()` se perdía un día al este de Greenwich: parseISO da
 * medianoche LOCAL y toISOString convierte a UTC, retrocediendo la fecha.
 * Por eso se formatea en local, nunca en UTC.
 */
function addDaysISO(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), 'yyyy-MM-dd')
}

const YEARLY_MULTIPLIER: Record<Cadence, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
}

/**
 * Detecta pagos periódicos: mismo comercio, importe parecido (±10 %) y
 * cadencia estable. Hacen falta al menos 3 apariciones para no confundir
 * dos compras seguidas con una suscripción.
 */
export function detectRecurring(
  transactions: readonly CandidateTransaction[],
  minOccurrences = 3,
): DetectedRecurring[] {
  const groups = new Map<string, CandidateTransaction[]>()

  for (const t of transactions) {
    if (t.amount >= 0) continue // solo gastos
    const key = normalizeMerchant(t.description)
    if (key.length < 3) continue
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  const result: DetectedRecurring[] = []

  for (const [key, items] of groups) {
    if (items.length < minOccurrences) continue

    const amounts = items.map((t) => Math.abs(t.amount))
    const average = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length)
    // Si los importes bailan más de un 10 %, no es una suscripción
    const withinTolerance = amounts.every((a) => Math.abs(a - average) <= average * 0.1)
    if (!withinTolerance) continue

    const dates = items.map((t) => t.date)
    const gap = medianGap(dates)
    const match = CADENCES.find((c) => Math.abs(gap - c.days) <= c.tolerance)
    if (!match) continue

    const sorted = [...items].sort((a, b) => (a.date < b.date ? 1 : -1))
    const lastSeen = sorted[0]!.date
    const lastAmount = Math.abs(sorted[0]!.amount)
    const previous = sorted.slice(1).map((t) => Math.abs(t.amount))
    const previousAvg =
      previous.length > 0 ? previous.reduce((a, b) => a + b, 0) / previous.length : lastAmount

    result.push({
      key,
      // Se muestra el literal original, no el normalizado
      name: sorted[0]!.description || key,
      category_id: sorted[0]!.category_id,
      cadence: match.cadence,
      averageAmount: average,
      occurrences: items.length,
      lastSeen,
      nextExpected: addDaysISO(lastSeen, match.days),
      yearlyCost: average * YEARLY_MULTIPLIER[match.cadence],
      priceIncreased: lastAmount > previousAvg * 1.05,
      transactionIds: items.map((t) => t.id),
    })
  }

  return result.sort((a, b) => b.yearlyCost - a.yearlyCost)
}

export const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: 'Cada semana',
  biweekly: 'Cada 2 semanas',
  monthly: 'Cada mes',
  quarterly: 'Cada 3 meses',
  yearly: 'Cada año',
}
