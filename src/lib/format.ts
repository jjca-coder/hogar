import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const eurFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const eurWholeFmt = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export const eur = (cents: number) => eurFmt.format(cents / 100)

/** Sin decimales — para cifras grandes como el patrimonio. */
export const eurWhole = (cents: number) => eurWholeFmt.format(cents / 100)

/** Compacto para ejes de gráfica: 12,4 k€ */
export const eurAxis = (cents: number) => {
  const v = cents / 100
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1).replace('.', ',')} k€`
  return `${Math.round(v)} €`
}

/** "12,50" | "12.50" | "1.234,56" -> céntimos. NaN si no es válido. */
export const parseAmount = (s: string): number => {
  const t = s.trim().replace(/\s|€/g, '')
  // Si hay coma, es el separador decimal y los puntos son de millar
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = parseFloat(normalized)
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
