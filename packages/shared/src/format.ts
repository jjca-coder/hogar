import { format as fnsFormat } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { toDecimal, type Money } from './money'

export type Locale = 'es' | 'en'

const DATE_FNS_LOCALES = { es, en: enUS } as const

interface FormatOptions {
  locale?: Locale
  /** Oculta los decimales — para cifras grandes tipo patrimonio neto. */
  compact?: boolean
  /** Antepone el signo también en positivos (+1.234,00 €). */
  signed?: boolean
}

const cache = new Map<string, Intl.NumberFormat>()

function numberFormat(locale: Locale, currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${locale}:${currency}:${compact}`
  let fmt = cache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', {
      style: 'currency',
      currency,
      // En es-ES la agrupación no se aplica a 4 dígitos (1234,56 €). En una app
      // de banca se espera siempre el punto, y además alinea mejor las columnas.
      useGrouping: 'always',
      ...(compact ? { maximumFractionDigits: 0 } : {}),
    })
    cache.set(key, fmt)
  }
  return fmt
}

/** Formato ES por defecto: decimal con coma y símbolo € pospuesto (1.234,56 €). */
export function formatMoney(m: Money, opts: FormatOptions = {}): string {
  const { locale = 'es', compact = false, signed = false } = opts
  const text = numberFormat(locale, m.currency, compact).format(toDecimal(m))
  return signed && m.amount > 0 ? `+${text}` : text
}

/** Compacto para ejes de gráfica: 12,4 k€ / 1,2 M€ */
export function formatMoneyAxis(m: Money, locale: Locale = 'es'): string {
  const v = toDecimal(m)
  const symbol = m.currency === 'EUR' ? '€' : m.currency
  const decimalSep = locale === 'es' ? ',' : '.'
  const fix = (n: number) => n.toFixed(1).replace('.', decimalSep)

  if (Math.abs(v) >= 1_000_000) return `${fix(v / 1_000_000)} M${symbol}`
  if (Math.abs(v) >= 1_000) return `${fix(v / 1_000)} k${symbol}`
  return `${Math.round(v)} ${symbol}`
}

/**
 * Parsea lo que escribe el usuario a unidades mínimas.
 * Acepta "1.234,56", "1234.56", "1234", "12,5 €". Devuelve null si no es válido.
 */
export function parseAmountToMinor(input: string): number | null {
  const cleaned = input.trim().replace(/[\s€$£]/g, '')
  if (!cleaned) return null

  // Si hay coma, es el separador decimal (formato ES) y los puntos son de millar
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned

  if (!/^-?\d*\.?\d*$/.test(normalized)) return null
  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

export function formatDate(date: Date, pattern = 'dd/MM/yyyy', locale: Locale = 'es'): string {
  return fnsFormat(date, pattern, { locale: DATE_FNS_LOCALES[locale] })
}

export function formatPercent(value: number, locale: Locale = 'es', decimals = 1): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Iniciales para avatares: "Jesús Carballo" -> "JC" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + second).toUpperCase()
}
