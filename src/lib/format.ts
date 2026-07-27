import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export const eur = (cents: number) => eurFmt.format(cents / 100)

/** "12,50" | "12.50" | "12" -> 1250 céntimos. NaN si no es válido. */
export const parseAmount = (s: string): number => {
  const n = parseFloat(s.trim().replace(/\./g, '.').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

export const todayISO = () => format(new Date(), 'yyyy-MM-dd')

export const monthLabel = (d: Date) => format(d, 'LLLL yyyy', { locale: es })

export const dayLabel = (iso: string) =>
  format(new Date(iso + 'T12:00:00'), "EEEE d 'de' LLLL", { locale: es })

export const shortDay = (iso: string) =>
  format(new Date(iso + 'T12:00:00'), 'd LLL', { locale: es })

export const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

export const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
