/**
 * Dinero. Regla nº2 del proyecto: SIEMPRE enteros (unidades mínimas de la divisa),
 * nunca float. Un `Money` es indivisible de su divisa para que no se puedan
 * sumar euros con dólares por accidente.
 */

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const
export type Currency = (typeof CURRENCIES)[number]

/** Decimales de la divisa. Añadir aquí las de 0 decimales (JPY) si hiciera falta. */
const MINOR_UNITS: Record<Currency, number> = { EUR: 2, USD: 2, GBP: 2, CHF: 2 }

export interface Money {
  /** Importe en unidades mínimas (céntimos para EUR). Siempre entero. */
  readonly amount: number
  readonly currency: Currency
}

export class CurrencyMismatchError extends Error {
  constructor(a: Currency, b: Currency) {
    super(`No se pueden operar importes en divisas distintas: ${a} y ${b}`)
    this.name = 'CurrencyMismatchError'
  }
}

export function money(amount: number, currency: Currency = 'EUR'): Money {
  if (!Number.isInteger(amount)) {
    throw new TypeError(`El importe debe ser un entero en unidades mínimas, recibido: ${amount}`)
  }
  return { amount, currency }
}

/** Convierte una cantidad "humana" (12.5 €) a Money. Redondea al céntimo más cercano. */
export function fromDecimal(value: number, currency: Currency = 'EUR'): Money {
  const factor = 10 ** MINOR_UNITS[currency]
  return money(Math.round(value * factor), currency)
}

export function toDecimal(m: Money): number {
  return m.amount / 10 ** MINOR_UNITS[m.currency]
}

function assertSame(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency)
}

export function add(a: Money, b: Money): Money {
  assertSame(a, b)
  return money(a.amount + b.amount, a.currency)
}

export function subtract(a: Money, b: Money): Money {
  assertSame(a, b)
  return money(a.amount - b.amount, a.currency)
}

export function sum(items: readonly Money[], currency: Currency = 'EUR'): Money {
  return items.reduce((acc, m) => add(acc, m), money(0, currency))
}

export function negate(m: Money): Money {
  return money(-m.amount, m.currency)
}

export function abs(m: Money): Money {
  return money(Math.abs(m.amount), m.currency)
}

/** Multiplica por un escalar (ej. porcentaje de un reparto). Redondeo al entero más cercano. */
export function multiply(m: Money, factor: number): Money {
  return money(Math.round(m.amount * factor), m.currency)
}

/**
 * Reparte un importe en N partes sin perder ni un céntimo:
 * los céntimos sobrantes se distribuyen de uno en uno entre las primeras partes.
 */
export function allocate(m: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new RangeError(`El número de partes debe ser un entero positivo, recibido: ${parts}`)
  }
  const base = Math.trunc(m.amount / parts)
  let remainder = m.amount - base * parts
  const step = remainder >= 0 ? 1 : -1
  return Array.from({ length: parts }, () => {
    const extra = remainder !== 0 ? step : 0
    remainder -= extra
    return money(base + extra, m.currency)
  })
}

/** Reparte según pesos (ej. 60/40). Mismo criterio: no se pierde ningún céntimo. */
export function allocateByWeights(m: Money, weights: readonly number[]): Money[] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) throw new RangeError('La suma de los pesos debe ser mayor que cero')

  const shares = weights.map((w) => Math.trunc((m.amount * w) / total))
  let remainder = m.amount - shares.reduce((a, b) => a + b, 0)
  const step = remainder >= 0 ? 1 : -1
  return shares.map((s) => {
    const extra = remainder !== 0 ? step : 0
    remainder -= extra
    return money(s + extra, m.currency)
  })
}

export const isZero = (m: Money): boolean => m.amount === 0
export const isNegative = (m: Money): boolean => m.amount < 0
export const isPositive = (m: Money): boolean => m.amount > 0

export function compare(a: Money, b: Money): number {
  assertSame(a, b)
  return a.amount - b.amount
}
